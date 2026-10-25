import type { OverlayState } from '@shared/types'
import { Check, ChevronDown, ChevronUp, Lock, LockOpen, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import BrandMark from '../../components/BrandMark'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useDataSync } from '../../lib/data-sync'
import { readOpacity, useSettings } from '../../lib/use-settings'
import { useToday } from '../../lib/use-today'
import { useTodoMutations, useTodos } from '../today/api'

const ICON_BUTTON =
  'flex size-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-panel-hover hover:text-ink'

/**
 * 悬浮窗界面。
 *
 * 与主窗口共用同一个 index.html，靠 `#/overlay` 区分。
 * 窗口本身是透明无边框的，这里的根元素负责画出「一张半透明卡片」，
 * 卡片外的区域直接透出桌面。
 *
 * 顶部是拖拽区（-webkit-app-region: drag），按钮必须显式标 no-drag，
 * 否则在拖拽区里的按钮点不动 —— 这是 Electron 无边框窗口最常见的坑。
 */
export default function OverlayApp() {
  const { today } = useToday()
  const { data } = useTodos(today)
  const { toggle } = useTodoMutations()

  // 透明度来自设置页，实现在 CSS 变量上：只改 alpha，文字不受影响
  const { data: settings } = useSettings()
  const opacity = readOpacity(settings)

  // 必须设在 <html> 上而不是卡片上 —— --overlay-bg 是在 :root 里由
  // rgb(var(--overlay-rgb) / var(--overlay-opacity)) 组合出来的，
  // 只在卡片上覆盖后者的时，background-color 仍按 :root 的值算。
  useEffect(() => {
    document.documentElement.style.setProperty('--overlay-opacity', String(opacity))
    return () => {
      document.documentElement.style.removeProperty('--overlay-opacity')
    }
  }, [opacity])

  // 悬浮窗是独立的渲染进程，没有这层订阅就收不到主窗口的写操作，
  // 表现为主窗口勾了待办、悬浮窗还是旧数据
  useDataSync()

  const [state, setState] = useState<OverlayState>({
    visible: true,
    locked: false,
    collapsed: false,
  })

  useEffect(() => {
    // 让全局样式知道这是悬浮窗：body 背景必须透明，否则圆角外面会有一块白
    document.documentElement.dataset['window'] = 'overlay'

    let cancelled = false
    void getApi()
      .overlay.getState()
      .then((next) => {
        if (!cancelled) setState(next)
      })

    const unsubscribe = getApi().onOverlayStateChanged(setState)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const todos = data ?? []
  const total = todos.length
  const doneCount = todos.filter((todo) => todo.status === 'done').length

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-[var(--overlay-radius)] border bg-[var(--overlay-bg)] text-ink transition-colors',
        state.locked ? 'border-warn/60' : 'border-[var(--overlay-line)]',
      )}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 px-3 [-webkit-app-region:drag]">
        <div className="flex min-w-0 items-center gap-2">
          <BrandMark size={14} className="shrink-0 text-brand" />
          <span className="shrink-0 text-xs font-medium">今日</span>
          <span className="tabular shrink-0 text-xs text-ink-muted">
            {doneCount}/{total}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 [-webkit-app-region:no-drag]">
          <button
            type="button"
            onClick={() => {
              void getApi().overlay.toggleCollapsed()
            }}
            aria-label={state.collapsed ? '展开列表' : '折叠为标题条'}
            className={ICON_BUTTON}
          >
            {state.collapsed ? (
              <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              void getApi().overlay.toggleLocked()
            }}
            aria-label={state.locked ? '解锁（恢复可点击）' : '锁定（鼠标穿透）'}
            className={ICON_BUTTON}
          >
            {state.locked ? (
              <Lock size={14} strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <LockOpen size={14} strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              void getApi().overlay.hide()
            }}
            aria-label="隐藏悬浮窗"
            className={ICON_BUTTON}
          >
            <X size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!state.collapsed ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {todos.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-ink-muted">今天还没有安排</p>
          ) : (
            <ul className="flex flex-col">
              {todos.map((todo) => {
                const done = todo.status === 'done'
                return (
                  <li key={todo.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-panel-hover">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => {
                          void toggle.mutateAsync(todo.id)
                        }}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                          'peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40',
                          done
                            ? 'border-brand bg-brand text-on-brand'
                            : 'border-line-strong bg-transparent',
                        )}
                      >
                        {done ? <Check size={10} strokeWidth={3.4} /> : null}
                      </span>
                      <span
                        className={cn(
                          'text-xs break-words',
                          done ? 'text-ink-subtle line-through' : 'text-ink',
                        )}
                      >
                        {todo.title}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      {state.locked ? (
        <div className="shrink-0 border-t border-warn/30 bg-warn-soft px-3 py-1.5 text-center [-webkit-app-region:no-drag]">
          <p className="text-[11px] font-medium text-warn">
            已锁定：点击会穿透 · 按 Ctrl+Shift+L 解锁
          </p>
        </div>
      ) : null}
    </div>
  )
}
