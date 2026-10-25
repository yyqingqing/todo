import type { Plan } from '@shared/types'
import { Layers, Plus, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorState from '../../components/ErrorState'
import PageHeader from '../../components/PageHeader'
import { cn } from '../../lib/cn'
import { usePlanMutations, usePlanTree } from './api'
import CategoryDialog from './CategoryDialog'
import PlanDetailPanel from './PlanDetailPanel'
import PlanFormDialog from './PlanFormDialog'
import PlanTimeline from './PlanTimeline'
import PlanTree from './PlanTree'
import { findNodeById } from './tree-utils'

const VIEW_TABS = [
  { value: 'tree', label: '树形' },
  { value: 'timeline', label: '时间线' },
] as const

type PlanView = (typeof VIEW_TABS)[number]['value']

export default function PlansPage() {
  const { data, isLoading, error, refetch } = usePlanTree()
  const { removePlan } = usePlanMutations()
  const nodes = data ?? []

  const [view, setView] = useState<PlanView>('tree')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [formParentId, setFormParentId] = useState<string | null>(null)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Plan | null>(null)

  // 默认选中第一个根计划；选中的被删掉时回退到第一个
  useEffect(() => {
    if (nodes.length === 0) {
      if (selectedId !== null) setSelectedId(null)
      return
    }
    if (selectedId === null || findNodeById(nodes, selectedId) === null) {
      setSelectedId(nodes[0]?.id ?? null)
    }
  }, [nodes, selectedId])

  const openCreate = (parentId: string | null): void => {
    setEditingPlan(null)
    setFormParentId(parentId)
    setFormOpen(true)
  }

  const openEdit = (plan: Plan): void => {
    setEditingPlan(plan)
    setFormParentId(plan.parentId)
    setFormOpen(true)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    try {
      await removePlan.mutateAsync(pendingDelete.id)
      setPendingDelete(null)
    } catch {
      // 失败时保留确认框，用户能看到"处理中"后按钮恢复可点
      setPendingDelete(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="计划"
        actions={
          <>
            {/* 视图切换：树形看层级与进度，时间线看各计划覆盖的时间段 */}
            <div className="mr-1 flex gap-0.5 rounded-md bg-panel-sunken p-0.5">
              {VIEW_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={view === tab.value}
                  onClick={() => setView(tab.value)}
                  className={cn(
                    'rounded-sm px-2.5 py-1 text-xs transition-colors',
                    view === tab.value
                      ? 'bg-panel font-medium text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setCategoryOpen(true)}>
              <Tag size={14} aria-hidden="true" />
              分类
            </Button>
            <Button size="sm" variant="primary" onClick={() => openCreate(null)}>
              <Plus size={14} aria-hidden="true" />
              新建计划
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
          加载中…
        </div>
      ) : error ? (
        <ErrorState
          message={error.message}
          onRetry={() => {
            void refetch()
          }}
        />
      ) : nodes.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="还没有计划"
          description="先建一个带起止时间的计划，比如「三个月背完一本单词书」，再把它拆成更小的阶段或具体任务。"
          action={
            <Button variant="primary" onClick={() => openCreate(null)}>
              新建第一个计划
            </Button>
          }
        />
      ) : view === 'timeline' ? (
        <div className="flex min-h-0 flex-1 p-4">
          <PlanTimeline
            nodes={nodes}
            onSelect={(id) => {
              // 从时间线点进某个计划后切回树形，用户能直接看到详情与任务
              setSelectedId(id)
              setView('tree')
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[280px] shrink-0 flex-col border-r border-line">
            <PlanTree nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {selectedId ? (
              <PlanDetailPanel
                planId={selectedId}
                onEdit={openEdit}
                onRemove={setPendingDelete}
                onAddChild={(parent) => openCreate(parent.id)}
                onSelectChild={setSelectedId}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-ink-muted">
                从左侧选一个计划
              </div>
            )}
          </div>
        </div>
      )}

      <PlanFormDialog
        open={formOpen}
        plan={editingPlan}
        parentId={formParentId}
        onClose={() => setFormOpen(false)}
      />

      <CategoryDialog open={categoryOpen} onClose={() => setCategoryOpen(false)} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除计划"
        description={`「${pendingDelete?.title ?? ''}」及其所有子计划和任务都会被删除，操作无法撤销。已经排进每日清单的记录会保留，但不再关联这个计划。`}
        confirmText="删除"
        danger
        busy={removePlan.isPending}
        onConfirm={() => {
          void confirmDelete()
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
