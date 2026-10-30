import { PRODUCT } from '@shared/product'
import { BarChart3, CalendarDays, Layers, ListChecks, Settings, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import SettingsDialog from '../features/settings/SettingsDialog'
import { useStudyStatus } from '../features/study/api'
import { getApi } from '../lib/api'
import { cn } from '../lib/cn'
import { useDataSync } from '../lib/data-sync'
import BrandMark from './BrandMark'
import Button from './Button'
import Dialog from './Dialog'
import ErrorToast from './ErrorToast'

const NAV_ITEMS = [
  { to: '/today', label: '今日', icon: ListChecks },
  { to: '/plans', label: '计划', icon: Layers },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/score', label: '积分', icon: BarChart3 },
  { to: '/study', label: '学习时间', icon: Timer },
] as const

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [longSessionOpen, setLongSessionOpen] = useState(false)
  const location = useLocation()

  // 侧边栏要在任何页面都能看出"还在计时"，所以状态提到这里
  const studyStatus = useStudyStatus()

  // 订阅主进程的数据变更广播，让两个窗口的数据保持一致
  useDataSync()

  /**
   * 窗口缩到托盘时把设置弹窗收掉。
   *
   * 不这么做的话：打开设置 -> 点窗口的 × （按设置是缩到托盘，不是退出）
   * -> 从托盘恢复，设置原样回来。React 状态不随窗口隐藏重置，
   * 用户看到的就是「设置弹窗每次都在、关不掉」。
   */
  useEffect(() => {
    return getApi().window.onHidden(() => setSettingsOpen(false))
  }, [])

  // 4 小时长会话提醒：只提醒，绝不自动结束（见 main/study/timer.ts）
  useEffect(() => {
    return getApi().study.onLongSession(() => setLongSessionOpen(true))
  }, [])

  /**
   * 原生 <dialog> 在窗口隐藏后状态会坏掉（showModal 抛 InvalidStateError），
   * 而长会话提醒恰恰可能在窗口缩到托盘时触发。所以隐藏期间只记意图，
   * 等窗口重新可见再弹 —— 那一刻用户才看得到。
   */
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const onVisibilityChange = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return (
    <div className="flex h-full min-h-0 bg-canvas">
      <aside className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-[var(--header-h)] shrink-0 items-center gap-2.5 px-4">
          <BrandMark size={20} className="text-brand" />
          <span className="text-lg font-semibold tracking-tight text-ink">{PRODUCT.name}</span>
        </div>

        <nav aria-label="主导航" className="flex flex-col gap-1 p-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-[var(--row-h)] items-center gap-2.5 rounded-md px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-ink-secondary hover:bg-panel-hover hover:text-ink',
                )
              }
            >
              <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
              {label}
              {to === '/study' && studyStatus.data?.running ? (
                <span
                  role="img"
                  aria-label="正在计时"
                  className="ml-auto size-1.5 animate-pulse rounded-full bg-brand"
                />
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto p-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-[var(--row-h)] w-full items-center gap-2.5 rounded-md px-3 text-sm text-ink-secondary transition-colors hover:bg-panel-hover hover:text-ink"
          >
            <Settings aria-hidden="true" size={16} strokeWidth={1.8} />
            设置
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* key 用路径：切换页面时重挂载，让入场动画生效 */}
        <div key={location.pathname} className="flex min-h-0 flex-1 flex-col animate-page-enter">
          <Outlet />
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* 长会话提醒：Esc / 点遮罩关闭 = 继续计时，只有明确点按钮才结束 */}
      <Dialog
        open={longSessionOpen && visible}
        onClose={() => setLongSessionOpen(false)}
        title="学习计时已满 4 小时"
        maxWidth="420px"
        footer={
          <>
            <Button
              onClick={() => {
                void getApi().study.stop()
                setLongSessionOpen(false)
              }}
            >
              结束计时
            </Button>
            <Button variant="primary" onClick={() => setLongSessionOpen(false)}>
              继续计时
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-secondary">
          计时不会自己停。如果这段学习已经结束，点「结束计时」；还要继续就关掉这个提示。
        </p>
      </Dialog>

      <ErrorToast />
    </div>
  )
}
