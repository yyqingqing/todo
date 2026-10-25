import { PRODUCT } from '@shared/product'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { applyTheme, readThemeMode, type ThemeMode } from '../../lib/theme'

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode)

  // 用原生 <dialog>：焦点陷阱、Esc 关闭、关闭后焦点归还浏览器已经实现好了，
  // 手写这三件事是可访问性 bug 的高发区。
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // 聚焦容器而不是第一个按钮：程序化聚焦会被 Chromium 判成键盘焦点，
      // 鼠标用户会看到按钮上一个突兀的焦点环。容器本身有边框，不需要额外轮廓。
      dialog.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const chooseTheme = (next: ThemeMode): void => {
    setThemeMode(next)
    applyTheme(next)
  }

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-labelledby="settings-title"
      onClose={onClose}
      // Esc 已经由原生 dialog 处理，这里显式处理一遍保证"遮罩点击"始终有键盘等价物
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      onClick={(event) => {
        // showModal 下点击遮罩，事件目标是 dialog 元素本身
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-auto w-[min(520px,calc(100vw-48px))] rounded-lg border border-line bg-panel p-0 text-ink shadow-pop backdrop:bg-scrim focus:outline-none"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="settings-title" className="text-lg font-semibold">
          设置
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭设置"
          className="flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink"
        >
          <X size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-medium tracking-wide text-ink-muted">外观</h3>

          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-ink">主题</span>
              <span className="text-xs text-ink-muted">跟随系统时随系统深浅色自动切换</span>
            </div>
            <fieldset className="flex shrink-0 gap-0.5 rounded-md bg-panel-sunken p-0.5">
              <legend className="sr-only">主题</legend>
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={themeMode === option.value}
                  onClick={() => chooseTheme(option.value)}
                  className={cn(
                    'rounded-sm px-2.5 py-1 text-xs transition-colors',
                    themeMode === option.value
                      ? 'bg-panel font-medium text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
          </div>
        </section>

        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 className="text-xs font-medium tracking-wide text-ink-muted">关于</h3>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink">{PRODUCT.name}</span>
            <span className="tabular text-xs text-ink-muted">v{__APP_VERSION__}</span>
          </div>
          <p className="text-xs text-ink-muted">{PRODUCT.tagline}</p>
        </section>
      </div>
    </dialog>
  )
}
