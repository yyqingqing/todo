export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'todo.theme'

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

/**
 * 首帧之前调用，避免浅色闪一下再变暗色。
 * 未设置过跟随系统。
 */
export function applyInitialTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY)
  const mode: ThemeMode =
    stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  applyTheme(mode)
}
