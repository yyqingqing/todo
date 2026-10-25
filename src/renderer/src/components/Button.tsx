import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  secondary: 'border border-line-strong bg-panel text-ink hover:bg-panel-hover',
  ghost: 'text-ink-secondary hover:bg-panel-hover hover:text-ink',
  danger: 'text-danger hover:bg-danger-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 gap-1 px-2.5 text-xs',
  md: 'h-[var(--control-h)] gap-1.5 px-3 text-sm',
}

/**
 * 统一按钮。默认 type="button"：这个应用里几乎所有按钮都不提交表单，
 * 默认 submit 会在包一层 form 后产生"点删除把表单提交了"这类诡异 bug。
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  )
}
