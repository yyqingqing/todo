import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { progressPercent } from '@shared/domain/progress'
import type { PlanNode } from '@shared/types'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { formatRangeCompact } from '../../lib/date'
import { usePlanMutations } from './api'

interface PlanTreeProps {
  nodes: PlanNode[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * 扁平化后的一行。
 *
 * 树在界面上是递归的，但拖拽需要一个线性顺序才能算"插到哪一行前面/后面"。
 * 只展开已展开的节点 —— 折叠的子树不参与拖拽排序，符合视觉上看到的东西。
 */
interface FlatRow {
  node: PlanNode
  depth: number
  parentId: string | null
  /** 在同级里的位置（0 起） */
  index: number
}

function flatten(nodes: readonly PlanNode[], collapsed: ReadonlySet<string>): FlatRow[] {
  const rows: FlatRow[] = []

  const walk = (list: readonly PlanNode[], depth: number, parentId: string | null): void => {
    list.forEach((node, index) => {
      rows.push({ node, depth, parentId, index })
      if (!collapsed.has(node.id)) walk(node.children, depth + 1, node.id)
    })
  }

  walk(nodes, 0, null)
  return rows
}

/** 判断 candidate 是不是 root 的后代（含自己），用于防环 */
function isDescendant(root: PlanNode, candidate: string): boolean {
  if (root.id === candidate) return true
  return root.children.some((child) => isDescendant(child, candidate))
}

function findNode(nodes: readonly PlanNode[], id: string): PlanNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** 光标落在目标行的哪一段 */
type DropZone = 'before' | 'after' | 'inside'

interface DropHint {
  overId: string
  zone: DropZone
  /** 目标行是否不可放置（拖到自己或子孙上） */
  invalid: boolean
}

/**
 * 计划树（支持拖拽移动与同级排序）。
 *
 * 放置规则沿用文件树的通用约定：
 * - 光标在目标行 **上 1/3** → 插到它前面（同级）
 * - 光标在目标行 **下 1/3** → 插到它后面（同级）
 * - 光标在目标行 **中间 1/3** → 成为它的子计划（排最后）
 *
 * 拖到自己或自己的子孙上会标记为无效，松手不提交 —— 后端也有 wouldCreateCycle
 * 兜底，但前端先挡掉可以避免一次无谓的往返和错误提示。
 */
export default function PlanTree({ nodes, selectedId, onSelect }: PlanTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hint, setHint] = useState<DropHint | null>(null)
  const { movePlan } = usePlanMutations()

  // 拖动超过 5px 才算拖拽，否则算点击 —— 不设这个阈值，点选计划会变成"拖了一下"
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const rows = useMemo(() => flatten(nodes, collapsed), [nodes, collapsed])
  const rowById = useMemo(() => new Map(rows.map((row) => [row.node.id, row])), [rows])

  /** 拖动元素相对目标行的位置：0=顶部，1=底部 */
  const zoneFromRatio = (ratio: number): DropZone => {
    if (ratio < 1 / 3) return 'before'
    if (ratio > 2 / 3) return 'after'
    return 'inside'
  }

  const handleDragMove = (event: DragMoveEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      setHint(null)
      return
    }

    const activeNode = findNode(nodes, String(active.id))
    const overRow = rowById.get(String(over.id))
    if (!activeNode || !overRow) {
      setHint(null)
      return
    }

    // 光标中心相对目标行的比例。用 translated rect 而不是原始坐标，
    // 这样滚动容器里也能算对
    const translated = active.rect.current.translated
    const activeCenterY = translated ? translated.top + translated.height / 2 : over.rect.top
    const ratio = (activeCenterY - over.rect.top) / Math.max(1, over.rect.height)

    setHint({
      overId: overRow.node.id,
      zone: zoneFromRatio(ratio),
      invalid: isDescendant(activeNode, overRow.node.id),
    })
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    const currentHint = hint
    setActiveId(null)
    setHint(null)

    if (!over || !currentHint || currentHint.invalid) return
    if (active.id === over.id) return

    const activeRow = rowById.get(String(active.id))
    const overRow = rowById.get(String(over.id))
    if (!activeRow || !overRow) return

    let parentId: string | null
    let index: number

    if (currentHint.zone === 'inside') {
      // 成为子计划：排在现有子节点的最后
      parentId = overRow.node.id
      index = overRow.node.children.length
    } else {
      parentId = overRow.parentId
      index = currentHint.zone === 'before' ? overRow.index : overRow.index + 1
    }

    // 位置没变就不提交：拖回原处不该产生一次写库 + 整树刷新
    const sameParent = (activeRow.parentId ?? null) === parentId
    const sameIndex = activeRow.index === index
    if (sameParent && sameIndex) return

    movePlan.mutate({ id: activeRow.node.id, parentId, index })
  }

  const toggle = (id: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const activeNode = activeId ? findNode(nodes, activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setHint(null)
      }}
    >
      <SortableContext
        items={rows.map((row) => row.node.id)}
        strategy={verticalListSortingStrategy}
      >
        <nav aria-label="计划树" className="flex-1 overflow-y-auto p-2">
          {rows.map((row) => (
            <SortableRow
              key={row.node.id}
              row={row}
              isSelected={row.node.id === selectedId}
              isDragging={row.node.id === activeId}
              isCollapsed={collapsed.has(row.node.id)}
              hasChildren={row.node.children.length > 0}
              hint={hint && hint.overId === row.node.id ? hint : null}
              onSelect={onSelect}
              onToggle={toggle}
            />
          ))}
        </nav>
      </SortableContext>

      {/* 拖拽时跟手的浮层：用固定高度，避免行高变化导致抖动 */}
      <DragOverlay dropAnimation={null}>
        {activeNode ? (
          <div className="flex h-9 items-center rounded-md border border-brand/40 bg-panel px-2 text-sm text-ink shadow-pop">
            <span className="truncate">{activeNode.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

interface SortableRowProps {
  row: FlatRow
  isSelected: boolean
  isDragging: boolean
  isCollapsed: boolean
  hasChildren: boolean
  hint: DropHint | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}

function SortableRow({
  row,
  isSelected,
  isDragging,
  isCollapsed,
  hasChildren,
  hint,
  onSelect,
  onToggle,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: row.node.id,
  })

  const percent = progressPercent(row.node.stats)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={cn(
        'relative flex min-h-[var(--row-h)] items-center rounded-md py-1 text-sm transition-colors',
        isSelected
          ? 'bg-brand-soft font-medium text-brand'
          : 'text-ink-secondary hover:bg-panel-hover hover:text-ink',
        // 拖到中间 = 成为子级，整行高亮；无效目标用危险色区分
        hint?.zone === 'inside' && !hint.invalid && 'ring-2 ring-brand/60 ring-inset',
        hint?.invalid && 'ring-2 ring-danger/50 ring-inset',
      )}
      {...attributes}
      {...listeners}
    >
      {/* 插入线：拖到上/下 1/3 时显示 */}
      {hint?.zone === 'before' && !hint.invalid ? (
        <span className="pointer-events-none absolute inset-x-1 -top-px h-0.5 rounded bg-brand" />
      ) : null}
      {hint?.zone === 'after' && !hint.invalid ? (
        <span className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded bg-brand" />
      ) : null}

      <div
        className="flex min-w-0 flex-1 items-center"
        // 缩进用内联 style：层级是运行时的，Tailwind 没法穷举
        style={{ paddingLeft: `${row.depth * 14 + 2}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              // 折叠按钮不参与拖拽，也不冒泡到行的选中
              event.stopPropagation()
              onToggle(row.node.id)
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `展开「${row.node.title}」` : `折叠「${row.node.title}」`}
            className="flex size-6 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors hover:text-ink"
          >
            <ChevronRight
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className={cn('transition-transform', !isCollapsed && 'rotate-90')}
            />
          </button>
        ) : (
          <span className="size-6 shrink-0" aria-hidden="true" />
        )}

        {/* 折叠按钮与选中按钮是兄弟节点：<button> 里不能嵌 <button> */}
        <button
          type="button"
          onClick={() => onSelect(row.node.id)}
          aria-current={isSelected ? 'true' : undefined}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 pr-1 text-left"
        >
          <span className="w-full truncate">{row.node.title}</span>
          {/* 起止时间：树上能直接看出计划落在哪段时间，不用点进详情 */}
          <span className="w-full truncate text-[10px] font-normal text-ink-subtle">
            {formatRangeCompact(row.node.startDate, row.node.endDate)}
          </span>
        </button>

        <span className="tabular shrink-0 pr-2 text-xs text-ink-subtle">{percent}%</span>
      </div>
    </div>
  )
}
