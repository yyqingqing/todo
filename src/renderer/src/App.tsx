import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router'
import AppShell from './components/AppShell'
import { watchSystemTheme } from './lib/theme'
import CalendarPage from './pages/CalendarPage'
import PlansPage from './pages/PlansPage'
import ScorePage from './pages/ScorePage'
import TodayPage from './pages/TodayPage'

/**
 * 本地 IPC 数据也走 TanStack Query：缓存、失效、并发去重都是现成的。
 * 阶段 2 起所有写操作完成后由主进程广播，前端 invalidateQueries 精确失效。
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

/**
 * 桌面应用用 HashRouter：生产环境是 file:// 加载，BrowserRouter 的路径路由会 404。
 */
export default function App() {
  // 「跟随系统」要随系统深浅色实时变化；返回的解绑函数交给 effect 清理，避免重复挂载累积监听器
  useEffect(() => watchSystemTheme(), [])

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/score" element={<ScorePage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
