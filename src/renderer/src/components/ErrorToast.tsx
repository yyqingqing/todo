import { CircleAlert, X } from 'lucide-react'
import { useEffect } from 'react'
import { useErrorToast } from '../lib/error-store'

const AUTO_DISMISS_MS = 5000

/**
 * 全局错误提示条。
 *
 * 固定在顶部居中、不遮挡操作区；5 秒自动消失，也可以手动关。
 * 用 role="alert" 让屏幕阅读器立即播报 —— 失败信息如果只是视觉出现，键盘用户会完全错过。
 */
export default function ErrorToast() {
  const message = useErrorToast((state) => state.message)
  const clear = useErrorToast((state) => state.clear)

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(clear, AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [message, clear])

  if (!message) return null

  return (
    <div
      role="alert"
      className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-[560px] items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 shadow-pop">
        <CircleAlert size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm break-words text-ink">{message}</p>
        <button
          type="button"
          onClick={clear}
          aria-label="关闭提示"
          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          <X size={13} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
