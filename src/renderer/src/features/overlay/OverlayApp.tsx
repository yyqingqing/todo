import type { OverlayState } from '@shared/types'
import { Check, Circle, Lock, LockOpen, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import BrandMark from '../../components/BrandMark'
import { getApi } from '../../lib/api'
import { cn } from '../../lib/cn'
import { colorStyle } from '../../lib/colors'
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
 * 两个形态：
 * - panel：360×460 面板，"下拉"形态。顶部是拖拽区（-webkit-app-region: drag），
 *   按钮必须显式标 no-drag，否则在拖拽区里的按钮点不动 —— 无边框窗口最常见的坑。
 * - ball：56×56 悬浮球，"上拉"形态。拖到屏幕左右边缘会吸附，悬停临时展开。
 *   球不能用 app-region: drag（拖拽区会吞掉 click，球就点不开了），
 *   拖动由主进程按光标位移搬窗口，见 beginDrag / endDrag。
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
    dock: null,
    hoverExpanded: false,
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

  const dragging = useRef(false)

  const todos = data ?? []
  const total = todos.length
  const doneCount = todos.filter((todo) => todo.status === 'done').length

  /* ---------------- 悬浮球 ---------------- */

  const isBall = state.collapsed && !state.hoverExpanded

  async function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>): Promise<void> {
    const element = event.currentTarget
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    if (!dragging.current) return
    dragging.current = false

    const moved = await getApi().overlay.endDrag()
    // 没位移 = 这是一次点击：把球展开成面板
    if (!moved) void getApi().overlay.toggleCollapsed()
  }

  if (isBall) {
    return (
      <button
        type="button"
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          void getApi().overlay.toggleCollapsed()
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragging.current = true
          void getApi().overlay.beginDrag()
        }}
        onPointerUp={(event) => {
          void handlePointerUp(event)
        }}
        onPointerCancel={() => {
          if (!dragging.current) return
          dragging.current = false
          void getApi().overlay.endDrag()
        }}
        className={cn(
          'flex h-full w-full cursor-grab touch-none flex-col items-center justify-center gap-px rounded-full',
          'border bg-[var(--overlay-bg)] text-ink backdrop-blur-sm transition-colors select-none',
          'active:cursor-grabbing',
          state.locked ? 'border-warn/60' : 'border-[var(--overlay-line)] hover:border-brand/50',
          // 吸附时球有一半在屏幕外，把内容推到露出来的那半边，别被切掉
          state.dock === 'right' ? 'pr-7' : state.dock === 'left' ? 'pl-7' : null,
        )}
        aria-label={`今日待办 ${doneCount}/${total}`}
      >
        <BrandMark size={15} className="shrink-0 text-brand" />
        <span className="tabular text-[10px] leading-none text-ink-muted">
          {doneCount}/{total}
        </span>
        {state.locked ? (
          <Lock size={9} strokeWidth={2.2} className="mt-px text-warn" aria-hidden="true" />
        ) : null}
      </button>
    )
  }

  /* ---------------- 面板 ---------------- */

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
            // 收起后的形态是悬浮球，箭头（上拉/下拉）在这里不成立，
            // 用圆圈本身表示"缩成球"
            aria-label={state.hoverExpanded ? '固定展开' : '收起为悬浮球'}
            title={state.hoverExpanded ? '固定展开' : '收起为悬浮球'}
            className={ICON_BUTTON}
          >
            <Circle size={13} strokeWidth={2} aria-hidden="true" />
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
                    {/* 悬浮窗空间小，用色点区分"计划任务"和"临时事项"，不放大段文字 */}
                    {todo.planTitle ? (
                      <span
                        className="mt-1 size-1.5 shrink-0 rounded-full"
                        style={colorStyle(todo.planColor)}
                        aria-hidden="true"
                      />
                    ) : (
                      <span
                        className="mt-1 size-1.5 shrink-0 rounded-full bg-ink-subtle/40"
                        aria-hidden="true"
                      />
                    )}
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

      {state.locked ? (
        <div className="flex h-7 shrink-0 items-center justify-center border-t border-warn/30 bg-warn-soft px-3 [-webkit-app-region:no-drag]">
          <p className="text-[11px] leading-none font-medium text-warn">
            已锁定：点击会穿透 · 按 Ctrl+Shift+L 解锁
          </p>
        </div>
      ) : null}
    </div>
  )
}
