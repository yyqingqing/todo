import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-contract'
import type { OverlayState } from '@shared/types'
import { BrowserWindow, screen } from 'electron'
import { getDb } from '../db/connection'
import { allSettings, setSetting } from '../db/repo/setting.repo'

const OVERLAY_WIDTH = 360
const OVERLAY_HEIGHT = 460
const COLLAPSED_HEIGHT = 60

interface StoredBounds {
  x: number
  y: number
  width: number
  height: number
}

let overlayWindow: BrowserWindow | null = null
let locked = false
let collapsed = false
/** 用户是否希望悬浮窗可见（区别于被全屏应用临时隐藏） */
let userVisible = false
let expandedHeight = OVERLAY_HEIGHT
let saveTimer: ReturnType<typeof setTimeout> | null = null
let watcher: ReturnType<typeof setInterval> | null = null

export function getOverlayState(): OverlayState {
  return { visible: userVisible, locked, collapsed }
}

function notifyState(): void {
  const state = getOverlayState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.overlayState, state)
  }
}

function defaultBounds(): StoredBounds {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - OVERLAY_WIDTH - 24,
    y: workArea.y + 24,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  }
}

/** 落在所有显示器之外（比如拔掉外接屏）时回退到主屏右上角，否则窗口会"消失" */
function normalizeBounds(bounds: StoredBounds): StoredBounds {
  const onScreen = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapX =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
    const overlapY =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
    return overlapX > 80 && overlapY > 40
  })
  return onScreen ? bounds : defaultBounds()
}

function loadBounds(): StoredBounds {
  try {
    const raw = allSettings(getDb())['overlay.bounds']
    if (!raw) return defaultBounds()
    const parsed = JSON.parse(raw) as Partial<StoredBounds>
    if (
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number'
    ) {
      return normalizeBounds(parsed as StoredBounds)
    }
  } catch {
    // 坏数据直接忽略，回到默认位置，不要让悬浮窗因为一条脏设置就打不开
  }
  return defaultBounds()
}

function saveBounds(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  const bounds = overlayWindow.getBounds()
  if (!collapsed) expandedHeight = bounds.height
  setSetting(
    getDb(),
    'overlay.bounds',
    JSON.stringify({ ...bounds, height: collapsed ? expandedHeight : bounds.height }),
  )
}

/** moved 事件会连续触发，防抖后再落库 */
function scheduleSaveBounds(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveBounds()
  }, 300)
}

function loadContent(win: BrowserWindow): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (is.dev && rendererUrl) {
    void win.loadURL(`${rendererUrl}#/overlay`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/overlay' })
  }
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const bounds = loadBounds()
  expandedHeight = bounds.height

  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    // 透明 + 无边框是这一段的核心；backgroundColor 必须带 alpha 通道，否则会出现不透明底色
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // Windows 上无边框透明窗口的 resize 体验很差，固定尺寸更稳；折叠时只改高度
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  // 'screen-saver' 层级高于普通置顶，能压在大多数窗口之上
  win.setAlwaysOnTop(true, 'screen-saver')

  win.on('moved', scheduleSaveBounds)
  win.on('closed', () => {
    overlayWindow = null
    userVisible = false
    notifyState()
  })

  loadContent(win)

  // 先赋值再挂 ready-to-show：saveBounds 依赖 overlayWindow
  overlayWindow = win

  win.once('ready-to-show', () => {
    // showInactive：显示但不抢焦点，否则用户正在打字时会被打断
    win.showInactive()
    // 首次创建就把位置落库，保证"不拖动也记住"
    saveBounds()
  })

  startFullscreenWatcher()
  return win
}

export function showOverlay(): void {
  userVisible = true
  const win = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : createOverlayWindow()
  if (!win.isVisible()) win.showInactive()
  notifyState()
}

export function hideOverlay(): void {
  userVisible = false
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
  notifyState()
}

export function setOverlayLocked(next: boolean): boolean {
  locked = next
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // forward: true 让窗口仍收到 mousemove（内部可以给 hover 反馈），但不拦截点击
    overlayWindow.setIgnoreMouseEvents(next, { forward: true })
  }
  notifyState()
  return locked
}

export function toggleOverlayLocked(): boolean {
  return setOverlayLocked(!locked)
}

export function toggleOverlayCollapsed(): boolean {
  if (!overlayWindow || overlayWindow.isDestroyed()) return collapsed

  const bounds = overlayWindow.getBounds()

  if (!collapsed) {
    expandedHeight = bounds.height
    collapsed = true
    overlayWindow.setBounds({ ...bounds, height: COLLAPSED_HEIGHT })
  } else {
    collapsed = false
    overlayWindow.setBounds({ ...bounds, height: expandedHeight })
  }

  notifyState()
  return collapsed
}

/**
 * 全屏应用检测（启发式）。
 *
 * Electron 没有"前台窗口是否全屏"的 API。精确做法要 Win32 的 GetForegroundWindow
 * 再比较窗口矩形与显示器矩形，那需要 native 模块（本机没有编译环境）。
 *
 * 这里用"任务栏被隐藏"作为代理信号：全屏应用会隐藏任务栏。
 * 代价是用户自己开了任务栏自动隐藏时也会被误判 —— 可接受，因为那种情况下
 * 用户本来就不希望桌面被遮挡。
 */
function startFullscreenWatcher(): void {
  if (watcher) return

  watcher = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed() || !userVisible) return

    const display = screen.getDisplayMatching(overlayWindow.getBounds())
    const taskbarHidden = display.bounds.height - display.workArea.height < 4

    if (taskbarHidden) {
      if (overlayWindow.isVisible()) overlayWindow.hide()
    } else if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive()
    }
  }, 2000)
}

/** 应用退出前清理定时器，避免定时器在窗口销毁后仍访问它 */
export function disposeOverlay(): void {
  if (watcher) {
    clearInterval(watcher)
    watcher = null
  }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}
