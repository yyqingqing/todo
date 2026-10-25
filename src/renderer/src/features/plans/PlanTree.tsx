import { progressPercent } from '@shared/domain/progress'
import type { PlanNode } from '@shared/types'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { formatRangeCompact } from '../../lib/date'

interface PlanTreeProps {
  nodes: PlanNode[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * 计划树。
 * 折叠状态放在这里而不是每行自己管：每个节点各持一份会让"全部展开/折叠"没法实现，
 * 而且父节点折叠时子节点状态会残留。
 */
export default function PlanTree({ nodes, selectedId, onSelect }: PlanTreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())

  const toggle = (id: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <nav aria-label="计划树" className="flex-1 overflow-y-auto p-2">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          collapsed={collapsed}
          onSelect={onSelect}
          onToggle={toggle}
        />
      ))}
    </nav>
  )
}

interface TreeNodeProps {
  node: PlanNode
  depth: number
  selectedId: string | null
  collapsed: ReadonlySet<string>
  onSelect: (id: string) => void
  onToggle: (id: string) => void
}

function TreeNode({ node, depth, selectedId, collapsed, onSelect, onToggle }: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.id)
  const isSelected = node.id === selectedId
  const percent = progressPercent(node.stats)

  return (
    <>
      <div
        className={cn(
          'flex min-h-[var(--row-h)] items-center rounded-md py-1 text-sm transition-colors',
          isSelected
            ? 'bg-brand-soft font-medium text-brand'
            : 'text-ink-secondary hover:bg-panel-hover hover:text-ink',
        )}
        // 缩进用内联 style：层级是运行时的，Tailwind 没法穷举
        style={{ paddingLeft: `${depth * 14 + 2}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `展开「${node.title}」` : `折叠「${node.title}」`}
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
          onClick={() => onSelect(node.id)}
          aria-current={isSelected ? 'true' : undefined}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 pr-1 text-left"
        >
          <span className="w-full truncate">{node.title}</span>
          {/* 起止时间：树上能直接看出计划落在哪段时间，不用点进详情 */}
          <span className="w-full truncate text-[10px] font-normal text-ink-subtle">
            {formatRangeCompact(node.startDate, node.endDate)}
          </span>
        </button>

        <span className="tabular shrink-0 pr-2 text-xs text-ink-subtle">{percent}%</span>
      </div>

      {!isCollapsed &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            collapsed={collapsed}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  )
}
