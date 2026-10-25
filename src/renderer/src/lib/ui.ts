/**
 * 表单控件的公共类名。
 * 抽成常量而不是组件：控件种类多（input/select/textarea），
 * 但样式必须一致，用常量比维护三个组件的 props 更省。
 */
export const inputClass =
  'h-[var(--control-h)] w-full rounded-md border border-line-strong bg-panel px-2.5 text-sm text-ink ' +
  'placeholder:text-ink-subtle transition-colors ' +
  'hover:border-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export const textareaClass =
  'w-full resize-y rounded-md border border-line-strong bg-panel px-2.5 py-2 text-sm text-ink ' +
  'placeholder:text-ink-subtle transition-colors ' +
  'hover:border-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

export const labelClass = 'text-xs font-medium text-ink-secondary'

export const fieldErrorClass = 'text-xs text-danger'
