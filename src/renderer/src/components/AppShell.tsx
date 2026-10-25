import { PRODUCT } from '@shared/product'
import { BarChart3, CalendarDays, Layers, ListChecks, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import SettingsDialog from '../features/settings/SettingsDialog'
import { getApi } from '../lib/api'
import { cn } from '../lib/cn'
import { useDataSync } from '../lib/data-sync'
import BrandMark from './BrandMark'
import ErrorToast from './ErrorToast'

const NAV_ITEMS = [
  { to: '/today', label: '今日', icon: ListChecks },
  { to: '/plans', label: '计划', icon: Layers },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/score', label: '积分', icon: BarChart3 },
] as const

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const location = useLocation()

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
      <ErrorToast />
    </div>
  )
}
