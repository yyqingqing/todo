import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  /** 必须写清"下一步点哪里"，不能只放一句"暂无数据" */
  description: string
  action?: ReactNode
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16">
      <span className="flex size-12 items-center justify-center rounded-lg border border-line bg-panel text-brand">
        <Icon aria-hidden size={22} strokeWidth={1.5} />
      </span>
      <div className="flex max-w-[46ch] flex-col items-center gap-1.5 text-center">
        <p className="text-lg font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  )
}
