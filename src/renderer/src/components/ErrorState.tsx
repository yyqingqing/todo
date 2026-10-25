import { TriangleAlert } from 'lucide-react'
import Button from './Button'

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

/** 错误态：必须给出"发生了什么 + 能做什么"，不能只显示一行红字 */
export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16">
      <span className="flex size-12 items-center justify-center rounded-lg border border-line bg-panel text-danger">
        <TriangleAlert size={22} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="flex max-w-[46ch] flex-col items-center gap-1.5 text-center">
        <p className="text-lg font-medium text-ink">加载失败</p>
        <p className="text-sm text-ink-muted">{message}</p>
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  )
}
