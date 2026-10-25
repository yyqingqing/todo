import { progressPercent } from '@shared/domain/progress'
import type { Plan } from '@shared/types'
import { CalendarDays, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import Button from '../../components/Button'
import MarkdownLazy from '../../components/MarkdownLazy'
import ProgressBar from '../../components/ProgressBar'
import { colorStyle } from '../../lib/colors'
import { formatRange } from '../../lib/date'
import { usePlanDetail } from './api'
import TaskList from './TaskList'

interface PlanDetailPanelProps {
  planId: string
  onEdit: (plan: Plan) => void
  onRemove: (plan: Plan) => void
  onAddChild: (parent: Plan) => void
  onSelectChild: (id: string) => void
}

export default function PlanDetailPanel({
  planId,
  onEdit,
  onRemove,
  onAddChild,
  onSelectChild,
}: PlanDetailPanelProps) {
  const { data: detail, isLoading, error } = usePlanDetail(planId)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="h-7 w-1/3 animate-pulse rounded bg-panel-sunken" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-panel-sunken" />
        <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-panel-sunken" />
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="p-6 text-sm text-danger">
        加载计划失败：{error.message}
      </div>
    )
  }

  if (!detail) {
    return <div className="p-6 text-sm text-ink-muted">这个计划不存在或已被删除</div>
  }

  const { plan, category, stats, tasks, childPlans } = detail
  const percent = progressPercent(stats)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="flex shrink-0 flex-col gap-3 border-b border-line px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-xl font-semibold text-ink">{plan.title}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={12} aria-hidden="true" />
                {formatRange(plan.startDate, plan.endDate)}
              </span>
              {category ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={colorStyle(category.color)}
                    aria-hidden="true"
                  />
                  {category.name}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onAddChild(plan)}>
              <Plus size={14} aria-hidden="true" />
              子计划
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onEdit(plan)}>
              <Pencil size={14} aria-hidden="true" />
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(plan)}
              className="hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={14} aria-hidden="true" />
              删除
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ProgressBar value={percent} className="flex-1" />
          <span className="tabular shrink-0 text-xs text-ink-muted">
            {stats.taskDone} / {stats.taskTotal} 项 · {percent}%
          </span>
        </div>

        {plan.note ? <MarkdownLazy>{plan.note}</MarkdownLazy> : null}
      </header>

      {childPlans.length > 0 ? (
        <section className="flex shrink-0 flex-col gap-2 border-b border-line px-6 py-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
            <Layers size={13} aria-hidden="true" />
            子计划
          </h3>
          <ul className="flex flex-col gap-0.5">
            {childPlans.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onSelectChild(child.id)}
                  className="flex h-9 w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-panel-hover"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{child.title}</span>
                  <span className="tabular shrink-0 text-xs text-ink-subtle">
                    {child.stats.taskDone}/{child.stats.taskTotal}
                  </span>
                  <span className="tabular w-9 shrink-0 text-right text-xs text-ink-subtle">
                    {progressPercent(child.stats)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <TaskList
        planId={plan.id}
        planStartDate={plan.startDate}
        planEndDate={plan.endDate}
        tasks={tasks}
      />
    </div>
  )
}
