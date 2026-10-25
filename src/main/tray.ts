import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'
import {
  getOverlayState,
  hideOverlay,
  onOverlayStateChange,
  showOverlay,
  toggleOverlayLocked,
} from './windows/overlay'

interface TrayHandlers {
  showMain: () => void
  quit: () => void
}

let tray: Tray | null = null
let unsubscribe: (() => void) | null = null

/**
 * 托盘。
 *
 * 它是"锁定穿透"的第二个外部入口 —— 悬浮窗锁定后自己点不到自己的按钮，
 * 全局快捷键是第一个入口，但快捷键会被别的应用占用、用户也未必记得住，
 * 托盘菜单是那种"实在不行点一下"的兜底。
 */
export function createTray(handlers: TrayHandlers): void {
  if (tray) return

  const iconPath = join(app.getAppPath(), 'build', 'icon.png')
  const image = nativeImage.createFromPath(iconPath)

  if (image.isEmpty()) {
    // 图标缺失不应该让整个应用起不来，托盘只是便利功能
    console.warn('[tray] 托盘图标加载失败，跳过托盘:', iconPath)
    return
  }

  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('青青')
  tray.on('click', handlers.showMain)

  rebuildMenu(handlers)

  // 锁定/显示状态一变就要重建菜单，否则菜单项文案会停在旧状态
  unsubscribe = onOverlayStateChange(() => rebuildMenu(handlers))
}

function rebuildMenu(handlers: TrayHandlers): void {
  if (!tray) return

  const overlay = getOverlayState()

  const menu = Menu.buildFromTemplate([
    { label: '打开主窗口', click: handlers.showMain },
    { type: 'separator' },
    {
      label: overlay.visible ? '隐藏悬浮窗' : '显示悬浮窗',
      click: () => {
        if (overlay.visible) hideOverlay()
        else showOverlay()
      },
    },
    {
      label: overlay.locked ? '解锁悬浮窗（Ctrl+Shift+L）' : '锁定悬浮窗（Ctrl+Shift+L）',
      click: () => {
        toggleOverlayLocked()
      },
    },
    { type: 'separator' },
    { label: '退出青青', click: handlers.quit },
  ])

  tray.setContextMenu(menu)
}

export function destroyTray(): void {
  unsubscribe?.()
  unsubscribe = null
  tray?.destroy()
  tray = null
}
