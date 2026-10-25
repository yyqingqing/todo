import { HashRouter, Navigate, Route, Routes } from 'react-router'
import AppShell from './components/AppShell'
import CalendarPage from './pages/CalendarPage'
import PlansPage from './pages/PlansPage'
import ScorePage from './pages/ScorePage'
import TodayPage from './pages/TodayPage'

/**
 * 桌面应用用 HashRouter：生产环境是 file:// 加载，BrowserRouter 的路径路由会 404。
 */
export default function App() {
  return (
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
  )
}
