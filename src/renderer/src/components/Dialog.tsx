import { X } from 'lucide-react'
import { type ReactNode, useEffect, useId, useRef } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 底部操作区，通常放取消 / 确定 */
  footer?: ReactNode
  maxWidth?: string
}

/**
 * 通用弹窗，基于原生 <dialog>。
 *
 * 用原生元素而不是自己画遮罩：焦点陷阱、Esc 关闭、关闭后焦点归还这三件事
 * 浏览器已经实现好了，手写它们是可访问性 bug 的高发区。
 *
 * 打开时聚焦容器而不是第一个按钮：程序化聚焦会被 Chromium 判成键盘焦点，
 * 鼠标用户会看到按钮上一个突兀的焦点框。
 */
export default function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = '520px',
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      onClick={(event) => {
        // showModal 下点击遮罩，事件目标是 dialog 元素本身
        if (event.target === dialogRef.current) onClose()
      }}
      // 宽度是动态值，只能走内联 style；其余样式仍在 className 里
      style={{ width: `min(${maxWidth}, calc(100vw - 48px))` }}
      className="m-auto rounded-lg border border-line bg-panel p-0 text-ink shadow-pop backdrop:bg-scrim focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>

      {footer ? (
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
      ) : null}
    </dialog>
  )
}
