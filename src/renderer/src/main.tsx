import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import OverlayApp from './features/overlay/OverlayApp'
import { queryClient } from './lib/query-client'
import { applyInitialTheme } from './lib/theme'
import './styles/index.css'

// 必须在首帧渲染前跑，否则暗色模式会闪一下白
applyInitialTheme()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('找不到 #root 挂载点，index.html 可能被改动')
}

// 同一个 index.html 承载两个窗口：主窗口走正常路由，悬浮窗走 #/overlay。
// 悬浮窗不需要路由（只有一个界面），所以直接渲染组件，不挂 Router。
const isOverlay = window.location.hash.startsWith('#/overlay')

createRoot(rootEl).render(
  <StrictMode>
    {isOverlay ? (
      <QueryClientProvider client={queryClient}>
        <OverlayApp />
      </QueryClientProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)
