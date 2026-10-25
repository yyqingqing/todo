export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'stepwise.theme'

/** 读用户偏好，未设置过返回跟随系统 */
export function readThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return mode === 'dark'
}

/** 把主题写到 <html data-theme>，CSS 里的暗色变量靠这个选择器生效 */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveIsDark(mode) ? 'dark' : 'light'
  localStorage.setItem(STORAGE_KEY, mode)
}

/** 首帧之前调用，避免浅色闪一下再变暗色 */
export function applyInitialTheme(): void {
  applyTheme(readThemeMode())
}

/**
 * 「跟随系统」时需要响应系统主题切换。
 * 返回解绑函数 —— 调用方必须在卸载时清理，否则重复挂载会累积监听器（内存泄漏的常见来源）。
 */
export function watchSystemTheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = (): void => {
    if (readThemeMode() === 'system') applyTheme('system')
  }
  query.addEventListener('change', handler)
  return () => query.removeEventListener('change', handler)
}
