import { BarChart3, CalendarDays, Layers, ListChecks } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { cn } from '../lib/cn'

const NAV_ITEMS = [
  { to: '/today', label: '今日', icon: ListChecks },
  { to: '/plans', label: '计划', icon: Layers },
  { to: '/calendar', label: '日历', icon: CalendarDays },
  { to: '/score', label: '积分', icon: BarChart3 },
] as const

export default function AppShell() {
  return (
    <div className="flex h-full min-h-0 bg-canvas">
      <aside className="flex w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-[var(--header-h)] shrink-0 items-center px-4">
          <span className="text-lg font-semibold tracking-tight text-ink">TODO</span>
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
              <Icon aria-hidden size={16} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
