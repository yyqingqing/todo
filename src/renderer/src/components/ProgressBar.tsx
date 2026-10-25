import { cn } from '../lib/cn'

interface ProgressBarProps {
  /** 0–100 的整数 */
  value: number
  className?: string
}

export default function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 overflow-hidden rounded-full bg-panel-sunken', className)}
    >
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        // 宽度是运行时算出来的，只能走内联 style
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
