import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  /** 标题右侧的次要信息，如日期 */
  meta?: string
  actions?: ReactNode
}

export default function PageHeader({ title, meta, actions }: PageHeaderProps) {
  return (
    <header className="flex h-[var(--header-h)] shrink-0 items-center justify-between gap-4 border-b border-line px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        {meta ? <span className="tabular text-sm text-ink-muted">{meta}</span> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
