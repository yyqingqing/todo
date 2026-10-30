import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-contract'
import type { OverlayDock, OverlayState } from '@shared/types'
import { BrowserWindow, type Point, type Rectangle, screen } from 'electron'
import { getDb } from '../db/connection'
import { allSettings, setSetting } from '../db/repo/setting.repo'

/*
 * 悬浮窗有两个形态，共用同一个 BrowserWindow，靠 setBounds 切换：
 *
 *   panel  360×460 面板，"下拉"形态，勾今日待办用
 *   ball   56×56 悬浮球，"上拉"形态，拖到屏幕左右边缘会吸附
 *
 * 吸附 = 把球挪到工作区外面一点，只留一半在屏幕内。悬停时临时展开成面板，
 * 光标离开再缩回球 —— 所以窗口尺寸会在两个值之间跳，不做逐帧动画：
 * Windows 上透明无边框窗口的 resize 每帧都很贵，看起来反而更抖。
 */

const PANEL_WIDTH = 360
const PANEL_HEIGHT = 460
/** 收起后的悬浮球直径 */
const BALL_SIZE = 56
/** 吸附后仍然露在屏幕内的宽度：正好半个球 */
const EDGE_VISIBLE = 28
/** 球中心离边缘小于这个距离就算贴边 */
const SNAP_DISTANCE = 20
/**
 * 悬停展开开关。
 *
 * false = 球必须点一下才展开。实测在桌面上，光标经常贴着屏幕边缘走，
 * 停留 180ms 的判定太容易被路过触发，一不留神面板就自己弹出来。
 * 关掉之后点击展开照常（走 expandPanel），下面的悬停状态机整体休眠。
 *
 * 想恢复悬停展开，把这里改成 true 即可 —— 相关代码与常量都还在，
 * 只是 startCursorWatcher 不再启动轮询。
 */
const HOVER_EXPAND_ENABLED = false
/** 光标在球上停留这么久才展开，避免鼠标只是路过就弹出一整块面板 */
const HOVER_INTENT_MS = 180
/** 光标离开面板多久后收回成球 */
const LEAVE_GRACE_MS = 420
/** 吸附时轮询光标的间隔。getCursorScreenPoint 很便宜，但没必要更密 */
const CURSOR_POLL_MS = 120
/** 拖动时窗口跟随光标的刷新间隔，约一帧 */
const DRAG_FOLLOW_MS = 16

interface StoredBounds {
  /** 展开态是面板左上角；收起态是球的位置 */
  x: number
  y: number
  /** 收起态存的是展开后应有的面板尺寸，不随球变小 */
  width: number
  height: number
  dock?: OverlayDock | null
  collapsed?: boolean
}

let overlayWindow: BrowserWindow | null = null
let locked = false
/** 用户把悬浮窗收成了球（意图，落库） */
let collapsed = false
/** 球吸在边缘时，鼠标悬停造成的临时展开（临时，不落库） */
let hoverExpanded = false
let dock: OverlayDock | null = null
/** 用户是否希望悬浮窗可见（区别于被全屏应用临时隐藏） */
let userVisible = false
let expandedHeight = PANEL_HEIGHT

let saveTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null
let fullscreenWatcher: ReturnType<typeof setInterval> | null = null
let cursorWatcher: ReturnType<typeof setInterval> | null = null
let dragTimer: ReturnType<typeof setInterval> | null = null

/** 拖动开始时的光标位置和窗口位置，拖动全程用它算偏移 */
let dragOrigin: { cursor: Point; window: Point } | null = null
/** 程序自己改窗口位置时置位，避免把 setBounds 的回声当成用户拖动 */
let suppressEvents = false
/** 光标进入球的时刻；0 表示当前不在球上 */
let hoverSinceAt = 0
/** 光标最后一次在展开面板内的时刻 */
let pointerLeftAt = 0
/**
 * 拖动刚结束时抑制悬停展开，直到光标先离开球一次。
 * 否则"拖到边缘松手"会让球立刻自己弹开成面板 —— 用户只是想把它放在那。
 */
let hoverBlockedUntilExit = false
/** 正在拖动球。拖动期间不判定悬停，否则拖着拖着就展开成面板了 */
let draggingBall = false

export function getOverlayState(): OverlayState {
  return { visible: userVisible, locked, collapsed, dock, hoverExpanded }
}

type StateListener = (state: OverlayState) => void

const stateListeners = new Set<StateListener>()

/**
 * 订阅悬浮窗状态变化（主进程内部用，比如托盘菜单需要跟着状态重建）。
 * 返回解绑函数。
 */
export function onOverlayStateChange(listener: StateListener): () => void {
  stateListeners.add(listener)
  return () => {
    stateListeners.delete(listener)
  }
}

function notifyState(): void {
  const state = getOverlayState()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.overlayState, state)
  }
  // 托盘菜单是静态的，状态变了必须重建，否则菜单里永远显示"隐藏悬浮窗"
  for (const listener of stateListeners) listener(state)
}

/* ------------------------------------------------------------------ */
/* 几何                                                                */
/* ------------------------------------------------------------------ */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function workAreaAround(rect: Rectangle): Rectangle {
  return screen.getDisplayMatching(rect).workArea
}

function defaultBounds(): StoredBounds {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - PANEL_WIDTH - 24,
    y: workArea.y + 24,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
  }
}

/** 贴着某条边时球应该在哪：半个球藏在屏幕外 */
function dockedBallBounds(side: OverlayDock, y: number, area: Rectangle): Rectangle {
  const clampedY = clamp(y, area.y, area.y + area.height - BALL_SIZE)
  if (side === 'right') {
    return {
      x: area.x + area.width - EDGE_VISIBLE,
      y: clampedY,
      width: BALL_SIZE,
      height: BALL_SIZE,
    }
  }
  return {
    x: area.x - (BALL_SIZE - EDGE_VISIBLE),
    y: clampedY,
    width: BALL_SIZE,
    height: BALL_SIZE,
  }
}

/**
 * 从球展开成面板。
 *
 * 吸边状态下贴着同一条边展开，看起来像从屏幕边缘滑出来；没吸边就地从球的
 * 左上角长出来，并保证整块面板落在工作区内。
 */
function panelBoundsFromBall(ball: Rectangle): Rectangle {
  const area = workAreaAround(ball)
  const height = Math.min(expandedHeight, area.height)
  const y = clamp(ball.y, area.y, area.y + area.height - height)
  const x =
    dock === 'right'
      ? area.x + area.width - PANEL_WIDTH
      : dock === 'left'
        ? area.x
        : clamp(ball.x, area.x, area.x + area.width - PANEL_WIDTH)
  return { x, y, width: PANEL_WIDTH, height }
}

/** 收起时球的位置：从面板右上角（收起按钮所在的位置）缩进去 */
function ballBoundsFromPanel(panel: Rectangle): Rectangle {
  return {
    x: panel.x + panel.width - BALL_SIZE,
    y: panel.y,
    width: BALL_SIZE,
    height: BALL_SIZE,
  }
}

function contains(rect: Rectangle, point: Point, padding = 0): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  )
}

/** 吸附时球有一半在屏幕外，命中区只能算露出来的那部分 */
function visiblePart(rect: Rectangle, area: Rectangle): Rectangle {
  const x = Math.max(rect.x, area.x)
  const y = Math.max(rect.y, area.y)
  const right = Math.min(rect.x + rect.width, area.x + area.width)
  const bottom = Math.min(rect.y + rect.height, area.y + area.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/* ------------------------------------------------------------------ */
/* 持久化                                                              */
/* ------------------------------------------------------------------ */

/**
 * 落在所有显示器之外（比如拔掉外接屏）时回退到主屏右上角，否则窗口会"消失"。
 *
 * 注意阈值：吸附态本来就有半个球在屏幕外，判定重叠时不能用面板那套数值，
 * 否则每次启动都会把贴边的球"救"回默认位置。
 */
function normalizeBounds(bounds: StoredBounds): StoredBounds {
  const rect: Rectangle = bounds.collapsed
    ? { x: bounds.x, y: bounds.y, width: BALL_SIZE, height: BALL_SIZE }
    : { x: bounds.x, y: bounds.y, width: PANEL_WIDTH, height: bounds.height }

  const onScreen = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const overlapX = Math.min(rect.x + rect.width, area.x + area.width) - Math.max(rect.x, area.x)
    const overlapY = Math.min(rect.y + rect.height, area.y + area.height) - Math.max(rect.y, area.y)
    return overlapX > 12 && overlapY > 20
  })
  return onScreen ? bounds : defaultBounds()
}

function loadBounds(): StoredBounds {
  try {
    const raw = allSettings(getDb())['overlay.bounds']
    if (!raw) return defaultBounds()
    const parsed = JSON.parse(raw) as Partial<StoredBounds>
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return normalizeBounds({
        x: parsed.x,
        y: parsed.y,
        width: typeof parsed.width === 'number' ? parsed.width : PANEL_WIDTH,
        height: typeof parsed.height === 'number' ? parsed.height : PANEL_HEIGHT,
        dock: parsed.dock === 'left' || parsed.dock === 'right' ? parsed.dock : null,
        collapsed: parsed.collapsed === true,
      })
    }
  } catch {
    // 坏数据直接忽略，回到默认位置，不要让悬浮窗因为一条脏设置就打不开
  }
  return defaultBounds()
}

function persistBounds(): void {
  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  const bounds = win.getBounds()
  if (!collapsed) expandedHeight = bounds.height

  // 记的始终是"这个形态自己的左上角"：
  // 展开态 = 面板左上角；球态 = 球的位置；悬停临时展开时 = 面板右上角（球缩回去的锚点）。
  // 宽度高度一律记展开后该有的面板尺寸，下次启动按这个建窗口 / 展开时不用再猜。
  const anchor = collapsed && hoverExpanded ? ballBoundsFromPanel(bounds) : bounds

  const payload: StoredBounds = {
    x: anchor.x,
    y: anchor.y,
    width: PANEL_WIDTH,
    height: expandedHeight,
    dock: collapsed ? dock : null,
    collapsed,
  }

  try {
    setSetting(getDb(), 'overlay.bounds', JSON.stringify(payload))
  } catch {
    // 数据库未就绪：位置只是偏好，丢了不影响正确性
  }
}

function persistVisible(): void {
  try {
    setSetting(getDb(), 'overlay.visible', userVisible ? '1' : '0')
  } catch {
    // 数据库未就绪
  }
}

/* ------------------------------------------------------------------ */
/* 窗口位置                                                            */
/* ------------------------------------------------------------------ */

function setWindowBounds(win: BrowserWindow, target: Rectangle): void {
  suppressEvents = true
  win.setBounds(target)
  // moved 事件是异步派发的，等它排空再恢复标记，否则程序改动会被当成用户拖动
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    settleTimer = null
    suppressEvents = false
  }, 140)
}

/** moved 会连续触发，防抖后再判定吸附 / 落库 */
function scheduleAfterMove(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    settleAfterMove()
  }, 160)
}

function settleAfterMove(): void {
  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  if (collapsed && !hoverExpanded) {
    updateDockFromPosition(win)
  } else if (dock || hoverExpanded) {
    // 面板被拖离边缘：吸附只对球生效。若是在悬停临时展开时被拖动，
    // 说明用户想把它固定在这儿，直接转成正式展开态
    dock = null
    if (hoverExpanded) {
      hoverExpanded = false
      collapsed = false
      stopCursorWatcher()
    }
    notifyState()
  }

  persistBounds()
}

/** 拖动结束后判定：球贴到左右哪条边 */
function updateDockFromPosition(win: BrowserWindow): void {
  const bounds = win.getBounds()
  const area = workAreaAround(bounds)

  const next: OverlayDock | null =
    bounds.x <= area.x + SNAP_DISTANCE
      ? 'left'
      : bounds.x + bounds.width >= area.x + area.width - SNAP_DISTANCE
        ? 'right'
        : null

  dock = next

  if (next) {
    setWindowBounds(win, dockedBallBounds(next, bounds.y, area))
    startCursorWatcher()
  } else {
    stopCursorWatcher()
    // 没贴边就只把球拉回工作区内，别让它卡在屏幕外面找不回来
    setWindowBounds(win, {
      x: clamp(bounds.x, area.x, area.x + area.width - BALL_SIZE),
      y: clamp(bounds.y, area.y, area.y + area.height - BALL_SIZE),
      width: BALL_SIZE,
      height: BALL_SIZE,
    })
  }

  notifyState()
}

/* ------------------------------------------------------------------ */
/* 形态切换                                                            */
/* ------------------------------------------------------------------ */

/** 收起成球。球落在面板右上角，贴着屏幕边缘时直接吸附 */
function collapseToBall(win: BrowserWindow): void {
  const panel = win.getBounds()
  expandedHeight = panel.height
  collapsed = true
  hoverExpanded = false

  const anchor = ballBoundsFromPanel(panel)
  const area = workAreaAround(anchor)
  const nearEdge: OverlayDock | null =
    anchor.x + anchor.width >= area.x + area.width - SNAP_DISTANCE
      ? 'right'
      : anchor.x <= area.x + SNAP_DISTANCE
        ? 'left'
        : null

  dock = nearEdge
  setWindowBounds(win, nearEdge ? dockedBallBounds(nearEdge, anchor.y, area) : anchor)
  // 收起按钮就在右上角，球会正好出现在光标底下：
  // 不封锁悬停的话，刚收起来就立刻又展开了
  hoverBlockedUntilExit = true
  startCursorWatcher()
}

/** 展开回面板。吸附状态下贴着原边展开 */
function expandPanel(win: BrowserWindow): void {
  const ball = win.getBounds()
  const target = panelBoundsFromBall(ball)
  collapsed = false
  hoverExpanded = false
  dock = null
  stopCursorWatcher()
  setWindowBounds(win, target)
}

function expandOnHover(win: BrowserWindow): void {
  const target = panelBoundsFromBall(win.getBounds())
  hoverExpanded = true
  setWindowBounds(win, target)
  pointerLeftAt = Date.now()
  notifyState()
}

function collapseFromHover(win: BrowserWindow): void {
  hoverExpanded = false
  const panel = win.getBounds()
  const area = workAreaAround(panel)
  if (dock) {
    setWindowBounds(win, dockedBallBounds(dock, panel.y, area))
  } else {
    // 兜底：没有吸附边时按面板右上角缩成球，别把一个"球"留在 360×460 的窗口里
    const ball = ballBoundsFromPanel(panel)
    setWindowBounds(win, {
      x: clamp(ball.x, area.x, area.x + area.width - BALL_SIZE),
      y: clamp(ball.y, area.y, area.y + area.height - BALL_SIZE),
      width: BALL_SIZE,
      height: BALL_SIZE,
    })
  }
  notifyState()
  persistBounds()
}

export function toggleOverlayCollapsed(): boolean {
  const win = overlayWindow
  if (!win || win.isDestroyed()) return collapsed

  if (!collapsed) {
    collapseToBall(win)
  } else {
    expandPanel(win)
  }

  persistBounds()
  notifyState()
  return collapsed
}

/* ------------------------------------------------------------------ */
/* 悬停展开                                                            */
/* ------------------------------------------------------------------ */

/*
 * 为什么用主进程轮询光标，而不是渲染进程的 mouseenter：
 *
 * 1. 锁定时窗口是 setIgnoreMouseEvents(true) 点击穿透的，虽然 forward: true
 *    还能收到 mousemove，但并不可靠（Windows 上跟随窗口变换会丢事件）；
 * 2. 球只有半个露在屏幕里，命中区是"球 ∩ 工作区"，渲染进程算不到屏幕坐标；
 * 3. 球本身要能拖动，拖拽期间不能顺手展开。
 *
 * screen.getCursorScreenPoint() 是纯查询，120ms 一次的开销可以忽略。
 */
function startCursorWatcher(): void {
  // 悬停展开已关闭（HOVER_EXPAND_ENABLED）：球必须点一下才展开。
  // 不启动轮询，下面的 tickCursorWatcher 与 hover 状态机整体休眠；
  // 点击路径走 expandPanel，与这里无关。
  if (!HOVER_EXPAND_ENABLED) return
  if (cursorWatcher) return
  cursorWatcher = setInterval(tickCursorWatcher, CURSOR_POLL_MS)
}

function stopCursorWatcher(): void {
  if (!cursorWatcher) return
  clearInterval(cursorWatcher)
  cursorWatcher = null
  hoverSinceAt = 0
}

function tickCursorWatcher(): void {
  const win = overlayWindow
  if (!win || win.isDestroyed() || !win.isVisible() || !userVisible) return
  // 拖动期间完全不判定：球跟着光标走，否则用户刚拖到一半就被展开打断
  if (draggingBall) return

  // 没吸边就不需要轮询：球在桌面中间时鼠标移上去不展开，点一下才展开
  if (!collapsed || !dock) {
    stopCursorWatcher()
    return
  }

  const bounds = win.getBounds()
  const cursor = screen.getCursorScreenPoint()

  if (!hoverExpanded) {
    const area = workAreaAround(bounds)
    const hit = visiblePart(bounds, area)
    if (!contains(hit, cursor, 6)) {
      hoverSinceAt = 0
      // 光标真的离开了，解除"拖完别急着展开"的封锁
      hoverBlockedUntilExit = false
      return
    }
    if (hoverBlockedUntilExit) {
      hoverSinceAt = 0
      return
    }
    if (!hoverSinceAt) {
      hoverSinceAt = Date.now()
    } else if (Date.now() - hoverSinceAt >= HOVER_INTENT_MS) {
      hoverSinceAt = 0
      expandOnHover(win)
    }
    return
  }

  // 已展开：光标在面板里就续命，离开超过宽限期再收回成球
  if (contains(bounds, cursor, 16)) {
    pointerLeftAt = Date.now()
  } else if (Date.now() - pointerLeftAt >= LEAVE_GRACE_MS) {
    collapseFromHover(win)
  }
}

/* ------------------------------------------------------------------ */
/* 拖动悬浮球                                                          */
/* ------------------------------------------------------------------ */

/**
 * 球不能用 -webkit-app-region: drag：那样整块拖拽区会吞掉 click，
 * 球就点不开了。改成自己搬窗口，顺带还能用位移量区分"拖"和"点"。
 */
export function beginOverlayDrag(): void {
  const win = overlayWindow
  if (!win || win.isDestroyed()) return

  if (dragTimer) clearInterval(dragTimer)
  const bounds = win.getBounds()
  dragOrigin = {
    cursor: screen.getCursorScreenPoint(),
    window: { x: bounds.x, y: bounds.y },
  }
  draggingBall = true
  hoverBlockedUntilExit = true
  hoverSinceAt = 0
  suppressEvents = true

  dragTimer = setInterval(() => {
    if (!dragOrigin || !overlayWindow || overlayWindow.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    overlayWindow.setPosition(
      Math.round(dragOrigin.window.x + (cursor.x - dragOrigin.cursor.x)),
      Math.round(dragOrigin.window.y + (cursor.y - dragOrigin.cursor.y)),
    )
  }, DRAG_FOLLOW_MS)
}

/** 结束拖动。返回位移是否超过点击阈值 —— 没超过就当成一次点击 */
export function endOverlayDrag(): boolean {
  const win = overlayWindow
  if (dragTimer) {
    clearInterval(dragTimer)
    dragTimer = null
  }

  const origin = dragOrigin
  dragOrigin = null
  draggingBall = false
  hoverBlockedUntilExit = true
  suppressEvents = false

  if (!win || win.isDestroyed() || !origin) return false

  const bounds = win.getBounds()
  const moved = Math.abs(bounds.x - origin.window.x) + Math.abs(bounds.y - origin.window.y) > 4

  if (collapsed && !hoverExpanded) updateDockFromPosition(win)
  persistBounds()
  return moved
}

/* ------------------------------------------------------------------ */
/* 窗口生命周期                                                        */
/* ------------------------------------------------------------------ */

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

  const stored = loadBounds()
  expandedHeight = stored.height
  collapsed = stored.collapsed === true
  dock = collapsed ? (stored.dock ?? null) : null

  const initial: Rectangle = collapsed
    ? { x: stored.x, y: stored.y, width: BALL_SIZE, height: BALL_SIZE }
    : { x: stored.x, y: stored.y, width: PANEL_WIDTH, height: stored.height }

  const win = new BrowserWindow({
    x: initial.x,
    y: initial.y,
    width: initial.width,
    height: initial.height,
    show: false,
    frame: false,
    // 透明 + 无边框是这一段的核心；backgroundColor 必须带 alpha 通道，否则会出现不透明底色
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // Windows 上无边框透明窗口的 resize 体验很差；用户不能拖边缘缩放，
    // 只能在"面板"和"球"两组固定尺寸之间切换
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

  win.on('moved', () => {
    if (suppressEvents) return
    scheduleAfterMove()
  })

  win.on('closed', () => {
    overlayWindow = null
    userVisible = false
    stopCursorWatcher()
    notifyState()
  })

  loadContent(win)

  // 先赋值再挂 ready-to-show：persistBounds 依赖 overlayWindow
  overlayWindow = win

  win.once('ready-to-show', () => {
    // showInactive：显示但不抢焦点，否则用户正在打字时会被打断
    win.showInactive()
    // 恢复到吸附位置：显示器可能换了，存盘的坐标要用当前工作区重新算一遍
    if (collapsed && dock) {
      setWindowBounds(win, dockedBallBounds(dock, initial.y, workAreaAround(initial)))
    }
    if (collapsed) startCursorWatcher()
    // 首次创建就把位置落库，保证"不拖动也记住"
    persistBounds()
  })

  startFullscreenWatcher()
  return win
}

/**
 * 等到窗口真的可见再 resolve。
 *
 * 首次创建时窗口要先加载完页面才会 show（ready-to-show），这段时间里
 * 调用方如果直接把主窗口藏起来，屏幕上会空一下。等这个 Promise 就没空窗期。
 */
function waitUntilShown(win: BrowserWindow, timeoutMs = 2000): Promise<void> {
  if (win.isVisible()) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      win.removeListener('show', finish)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    win.once('show', finish)
  })
}

export async function showOverlay(): Promise<void> {
  userVisible = true
  const win = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : createOverlayWindow()
  if (!win.isVisible()) win.showInactive()
  await waitUntilShown(win)
  if (collapsed) {
    // 打开时别因为光标恰好停在球上就自己弹开
    hoverBlockedUntilExit = true
    startCursorWatcher()
  }
  persistVisible()
  notifyState()
}

export function hideOverlay(): void {
  userVisible = false
  stopCursorWatcher()
  // 关闭时顺手解锁：窗口都藏起来了，锁定状态没有意义；
  // 保留的话用户下次打开会看到一个点不动的悬浮窗（还得再按一次 Ctrl+Shift+L）
  if (locked) {
    locked = false
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(false)
    }
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // 隐藏前先把临时展开收回去，下次打开才是球本身的大小
    if (hoverExpanded) hoverExpanded = false
    overlayWindow.hide()
  }
  persistVisible()
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
  if (fullscreenWatcher) return

  fullscreenWatcher = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed() || !userVisible) return

    const display = screen.getDisplayMatching(overlayWindow.getBounds())
    const taskbarHidden = display.bounds.height - display.workArea.height < 4

    if (taskbarHidden) {
      if (overlayWindow.isVisible()) {
        // 被全屏应用顶掉之前先收回临时展开，回来时尺寸才是对的
        hoverExpanded = false
        overlayWindow.hide()
      }
    } else if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive()
      if (collapsed && dock) {
        const area = workAreaAround(overlayWindow.getBounds())
        setWindowBounds(overlayWindow, dockedBallBounds(dock, overlayWindow.getBounds().y, area))
      }
    }
  }, 2000)
}

/** 应用退出前清理定时器，避免定时器在窗口销毁后仍访问它 */
export function disposeOverlay(): void {
  if (fullscreenWatcher) {
    clearInterval(fullscreenWatcher)
    fullscreenWatcher = null
  }
  stopCursorWatcher()
  if (dragTimer) {
    clearInterval(dragTimer)
    dragTimer = null
    dragOrigin = null
  }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}
