import { PRODUCT } from '@shared/product'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useErrorToast } from '../../lib/error-store'
import { queryClient } from '../../lib/query-client'
import { applyTheme, readThemeMode, type ThemeMode } from '../../lib/theme'
import {
  DEFAULT_OVERLAY_OPACITY,
  readOpacity,
  useOverlayState,
  useSettings,
} from '../../lib/use-settings'

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const CLOSE_ACTIONS: ReadonlyArray<{ value: 'tray' | 'quit'; label: string }> = [
  { value: 'tray', label: '缩到托盘' },
  { value: 'quit', label: '直接退出' },
]

const SHORTCUTS = [
  { keys: 'Ctrl + Shift + L', label: '锁定 / 解锁悬浮窗（鼠标穿透）' },
  { keys: 'Ctrl + Shift + O', label: '显示 / 隐藏悬浮窗' },
] as const

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode)

  const { data: settings } = useSettings()
  const { data: overlayState } = useOverlayState()
  const [opacity, setOpacity] = useState(DEFAULT_OVERLAY_OPACITY)
  const saveTimer = useRef<number | null>(null)

  // 设置读回来后同步一次，避免界面显示默认值而实际用的是库里的值
  useEffect(() => {
    setOpacity(readOpacity(settings))
  }, [settings])

  // 卸载时清掉还没执行的防抖保存，否则会对已卸载组件 setState / 写入过期值
  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const updateOpacity = (value: number): void => {
    setOpacity(value)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    // 拖动滑块会连续触发 change，防抖后再写库
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      void getApi().setting.set('overlay.opacity', String(value))
    }, 250)
  }

  const closeAction = settings?.['app.closeAction'] === 'quit' ? 'quit' : 'tray'

  const setCloseAction = (value: 'tray' | 'quit'): void => {
    void getApi().setting.set('app.closeAction', value)
  }

  /**
   * 切换开机自启。
   *
   * 关键：按**返回值**（系统实际状态）更新界面，不按点击意图。
   * 安全软件拦截写入时 setLoginItemSettings 静默失败，如果界面翻到"已开启"
   * 而系统里没写进去，用户会以为开机会自动启动 —— 那是骗人。
   */
  const toggleLaunchAtLogin = async (): Promise<void> => {
    const want = !launchAtLogin
    const actual = await getApi().app.setLaunchAtLogin(want)
    await queryClient.invalidateQueries({ queryKey: ['launch-state'] })

    if (actual.supported && actual.enabled !== want) {
      useErrorToast
        .getState()
        .show(
          want
            ? '开机自启没有设置成功。可能是安全软件拦截了启动项写入，请在安全软件里放行本程序后重试。'
            : '关闭开机自启失败，请检查系统的「启动」设置。',
        )
    }
  }

  const [resetOpen, setResetOpen] = useState(false)

  /** 只重置「偏好类」设置，不碰任何业务数据 */
  const resetSettings = async (): Promise<void> => {
    applyTheme('system')
    setThemeMode('system')
    setOpacity(DEFAULT_OVERLAY_OPACITY)
    await getApi().setting.set('overlay.opacity', String(DEFAULT_OVERLAY_OPACITY))
    await getApi().setting.set('app.closeAction', 'tray')
    // 开机自启也属于偏好，一并关掉；它会真正去写系统注册表，所以走专用方法而不是 setting.set
    await getApi().app.setLaunchAtLogin(false)
    setResetOpen(false)
  }

  // 只在弹窗打开时查询，避免应用启动时就打一次 IPC
  const { data: dbInfo } = useQuery({
    queryKey: ['db-info'],
    queryFn: () => getApi().app.info(),
    enabled: open,
  })

  /**
   * 开机自启的真实状态：读系统（HKCU\...\Run），不是读设置表。
   *
   * staleTime: 0 —— 用户可能在任务管理器的「启动」页手动禁用过我们，
   * 每次打开设置都重新读一次，避免显示过期状态。
   */
  const launchStateQuery = useQuery({
    queryKey: ['launch-state'],
    queryFn: () => getApi().app.getLaunchState(),
    enabled: open,
    staleTime: 0,
  })
  const launchAtLogin = launchStateQuery.data?.enabled ?? false
  const launchSupported = launchStateQuery.data?.supported ?? false

  /**
   * 不用原生 <dialog> 了。
   *
   * 原因：窗口被隐藏或最小化时，Chromium 会把模态对话框降级成普通元素 ——
   * open 属性还在，但没有遮罩、位置跑到视口顶部、click 行为也变了。
   * 之后无论 showModal 还是 close 都可能抛 InvalidStateError，
   * 留下一个「靠上、没有遮罩、关不掉」的残影。
   *
   * 自绘覆盖层没有这个问题：显不显示、在不在最上层，完全由 React 状态决定，
   * 窗口怎么折腾都不影响。代价是焦点陷阱和 Esc 要自己写（下面补了）。
   */
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      // Tab 在弹窗内部循环，别让焦点跑到背景页面去
      const root = panelRef.current
      if (!root) return
      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    // 打开期间锁住背景滚动，避免弹窗后面的列表跟着动
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  // 关闭时直接不渲染：DOM 里没有元素，就不存在"状态半残"的可能
  if (!open) return null

  const chooseTheme = (next: ThemeMode): void => {
    setThemeMode(next)
    applyTheme(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩：点它关闭。用独立元素而不是 dialog::backdrop —— 后者只存在于模态状态 */}
      <div
        className="absolute inset-0 bg-scrim"
        onClick={onClose}
        aria-hidden="true"
        data-testid="settings-scrim"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-[min(520px,100%)] flex-col overflow-hidden rounded-lg border border-line bg-panel text-ink shadow-pop focus:outline-none"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
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

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
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

          <section className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="text-xs font-medium tracking-wide text-ink-muted">悬浮窗</h3>

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  置于桌面顶端
                  {/* 状态点：让用户一眼看出现在是开着还是关着，而不是靠猜按钮语义 */}
                  <span
                    className={cn(
                      'rounded-sm border px-1 py-px text-[10px] leading-normal',
                      overlayState?.visible
                        ? 'border-brand/40 bg-brand-soft text-brand'
                        : 'border-line-strong bg-panel-sunken text-ink-muted',
                    )}
                  >
                    {overlayState?.visible ? '已显示' : '已关闭'}
                  </span>
                </span>
                <span className="text-xs text-ink-muted">
                  可拖到任意位置 · Ctrl+Shift+L 锁定穿透 · Ctrl+Shift+O 显示/隐藏
                </span>
              </div>
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => {
                  // 开关合一的按钮：按当前状态决定是开还是关
                  void (overlayState?.visible ? getApi().overlay.hide() : getApi().overlay.show())
                }}
              >
                {overlayState?.visible ? '关闭悬浮窗' : '打开悬浮窗'}
              </Button>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="overlay-opacity" className="text-sm text-ink">
                  背景不透明度
                </label>
                <div className="flex items-center gap-2">
                  <span className="tabular text-xs text-ink-muted">
                    {Math.round(opacity * 100)}%
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5"
                    disabled={opacity === DEFAULT_OVERLAY_OPACITY}
                    onClick={() => updateOpacity(DEFAULT_OVERLAY_OPACITY)}
                  >
                    恢复默认
                  </Button>
                </div>
              </div>
              <input
                id="overlay-opacity"
                type="range"
                min={35}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                onChange={(event) => updateOpacity(Number(event.target.value) / 100)}
                aria-describedby="overlay-opacity-hint"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-panel-sunken accent-brand"
              />
              <p id="overlay-opacity-hint" className="text-xs text-ink-muted">
                只影响卡片背景，文字始终保持清晰。默认 {Math.round(DEFAULT_OVERLAY_OPACITY * 100)}
                %。
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-xs font-medium tracking-wide text-ink-muted">应用</h3>
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-ink">点关闭按钮时</span>
                <span className="text-xs text-ink-muted">
                  缩到托盘时应用继续在后台运行，悬浮窗不受影响
                </span>
              </div>
              <fieldset className="flex shrink-0 gap-0.5 rounded-md bg-panel-sunken p-0.5">
                <legend className="sr-only">关闭行为</legend>
                {CLOSE_ACTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={closeAction === option.value}
                    onClick={() => setCloseAction(option.value)}
                    className={cn(
                      'rounded-sm px-2.5 py-1 text-xs transition-colors',
                      closeAction === option.value
                        ? 'bg-panel font-medium text-ink shadow-sm'
                        : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </fieldset>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-line pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-ink">开机自动启动</span>
                <span className="text-xs text-ink-muted">
                  {launchSupported ? '开机后只显示悬浮窗和托盘，不弹主窗口' : '打包安装后可开启'}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={launchAtLogin}
                aria-label="开机自动启动"
                disabled={!launchSupported}
                onClick={() => {
                  void toggleLaunchAtLogin()
                }}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full p-0 transition-colors disabled:opacity-40',
                  launchAtLogin ? 'bg-brand' : 'bg-line-strong',
                )}
              >
                {/*
                  必须写死 left-0.5：只写 absolute 而不给 left/right 时，
                  位置会退化成 static position（受 button 默认 padding 影响），
                  滑块会被挤到容器外 —— 表现就是整条开关全绿、看不到圆点。
                  w-11(44) - 圆点 20 - 左 2 - 右 2 = 20px 位移。
                */}
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform',
                    launchAtLogin ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-xs font-medium tracking-wide text-ink-muted">快捷键</h3>
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{shortcut.label}</span>
                <kbd className="rounded border border-line-strong bg-panel-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
            <p className="text-xs text-ink-muted">
              暂时不支持自定义：改成系统已占用的组合会导致快捷键失效且无法在应用内恢复。
            </p>
          </section>

          <section className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-xs font-medium tracking-wide text-ink-muted">数据</h3>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-ink">存储位置</span>
              <span className="break-all text-xs text-ink-muted">{dbInfo?.path ?? '读取中…'}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink">结构版本</span>
              <span className="tabular text-xs text-ink-muted">
                {dbInfo ? `v${dbInfo.schemaVersion}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-muted">
                备份：直接拷贝目录里的 qingqing.db（连同 -wal 文件）
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void getApi().app.openDataDir()
                }}
              >
                打开数据目录
              </Button>
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

          <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
            <span className="text-xs text-ink-muted">把主题、透明度、关闭行为恢复成初始值</span>
            <Button size="sm" variant="ghost" onClick={() => setResetOpen(true)}>
              恢复默认设置
            </Button>
          </div>
        </div>

        <ConfirmDialog
          open={resetOpen}
          title="恢复默认设置"
          description="主题、悬浮窗透明度、关闭行为会恢复成初始值。计划、任务和积分记录不受影响。"
          confirmText="恢复"
          onConfirm={() => {
            void resetSettings()
          }}
          onCancel={() => setResetOpen(false)}
        />
      </div>
    </div>
  )
}
