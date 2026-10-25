import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyInitialTheme } from './lib/theme'
import './styles/index.css'

// 必须在首帧渲染前跑，否则暗色模式会闪一下白
applyInitialTheme()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('找不到 #root 挂载点，index.html 可能被改动')
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
