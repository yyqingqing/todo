import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-contract'
import { PRODUCT } from '@shared/product'
import { app, BrowserWindow, globalShortcut, nativeTheme, session, shell } from 'electron'
import { closeDatabase, getDb, openDatabase } from './db/connection'
import { allSettings } from './db/repo/setting.repo'
import { registerIpcHandlers } from './ipc'
import { syncLaunchAtLogin } from './launch-at-login'
import { createTray, destroyTray } from './tray'
import {
  disposeOverlay,
  getOverlayState,
  hideOverlay,
  showOverlay,
  toggleOverlayLocked,
} from './windows/overlay'

/**
 * 窗口级背景色。Electron 建窗口时就要这个值，此时 CSS 变量还没加载。
 * 必须与 styles/tokens.css 的 --canvas 一致，否则启动瞬间会闪一下。
 */
const WINDOW_BG = { light: '#f7f8fa', dark: '#0f1319' } as const

let mainWindow: BrowserWindow | null = null
/** 正在退出：此时不再拦截窗口关闭，否则会陷入「关不掉」的死循环 */
let isQuitting = false

/**
 * 开机自启时不弹主窗口。
 * dev 下忽略该参数：开发时启动就该看到窗口，否则会以为程序没跑起来。
 */
const START_HIDDEN = process.argv.includes('--hidden') && !is.dev

/** 关闭按钮的行为。读不到设置时按「缩到托盘」处理，这是更安全的默认值（不会误退） */
function readCloseAction(): 'tray' | 'quit' {
  try {
    return allSettings(getDb())['app.closeAction'] === 'quit' ? 'quit' : 'tray'
  } catch {
    return 'tray'
  }
}

/** 上次退出时悬浮窗是否开着。读不到就当作关闭 */
function readOverlayVisible(): boolean {
  try {
    return allSettings(getDb())['overlay.visible'] === '1'
  } catch {
    return false
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? WINDOW_BG.dark : WINDOW_BG.light,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 界面不需要 Node 能力，开沙箱。preload 只用 contextBridge，完全兼容沙箱。
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow = win
  win.on('ready-to-show', () => {
    // 开机自启（--hidden）时不显示主窗口：用户要的是悬浮窗和托盘，
    // 不是每次开机都被一个窗口抢焦点
    if (!START_HIDDEN) win.show()
  })

  // 窗口被隐藏或最小化时通知界面，让它把打开的弹窗收掉。
  // 这两种情况都不会重置 React 状态，恢复后弹窗会原样回来，看起来像"关不掉"。
  const notifyHidden = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IPC.windowHidden)
  }
  win.on('hide', notifyHidden)
  win.on('minimize', notifyHidden)

  // 关闭行为：默认缩到托盘继续跑（悬浮窗还在用），用户可以在设置里改成直接退出
  win.on('close', (event) => {
    if (isQuitting) return

    if (readCloseAction() === 'tray') {
      event.preventDefault()
      win.hide()
      return
    }

    // 直接退出模式：连悬浮窗一起关掉，否则窗口关完了应用还挂在后台
    isQuitting = true
    app.quit()
  })

  win.on('closed', () => {
    mainWindow = null
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const devOrigin = (() => {
    if (!rendererUrl) return null
    try {
      return new URL(rendererUrl).origin
    } catch {
      return null
    }
  })()

  // 应用本身是单页 hash 路由，任何真实页面跳转都属于异常：拦下来。
  // 只把 https 外链交给系统浏览器，避免被引导到 file:// 或自定义协议。
  win.webContents.on('will-navigate', (event, url) => {
    const isInternal = is.dev && devOrigin ? url.startsWith(devOrigin) : url.startsWith('file://')
    if (isInternal) return
    event.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
  })

  if (is.dev && rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** 全局安全策略：app ready 之后、建窗之前执行一次 */
function harden(): void {
  // 这个应用不需要摄像头 / 麦克风 / 定位 / 剪贴板读取等任何权限，一律拒绝
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)

  // 所有 webContents（含悬浮窗）共用一套外链策略，避免逐个窗口设置时漏掉
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
}

// 必须先定名字：userData 目录和单实例锁都基于它。
// 用英文名，避免中文路径在 sqlite 与打包工具里出现编码问题。
app.setName(PRODUCT.nameEn)

if (!app.requestSingleInstanceLock()) {
  // 两个实例同时写 sqlite 会互相锁死，直接退出
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId(PRODUCT.appId)
    harden()

    // 数据库必须在建窗口之前就绪：窗口一加载就可能通过 IPC 发起查询
    openDatabase()
    registerIpcHandlers()

    // 把「开机自启」设置同步到系统；用户可能在外面手动关过，每次启动纠正一次
    syncLaunchAtLogin()

    // 恢复上次的悬浮窗状态：开机自启后主窗口是隐藏的，
    // 如果悬浮窗也不出来，用户会以为程序没启动
    if (readOverlayVisible()) showOverlay()

    // dev 下 F12 开 DevTools、F5 刷新（生产环境自动不生效）
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createMainWindow()

    createTray({
      showMain: showMainWindow,
      quit: () => {
        isQuitting = true
        app.quit()
      },
    })

    // 悬浮窗锁定后自己点不到自己的按钮，必须有窗口外的入口：
    // 快捷键是最快的，托盘菜单是"记不住快捷键时"的兜底。
    globalShortcut.register('CommandOrControl+Shift+L', () => {
      toggleOverlayLocked()
    })
    globalShortcut.register('CommandOrControl+Shift+O', () => {
      if (getOverlayState().visible) hideOverlay()
      else showOverlay()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  // 退出前清理：定时器、托盘、快捷键、数据库连接
  app.on('will-quit', () => {
    disposeOverlay()
    destroyTray()
    globalShortcut.unregisterAll()
    closeDatabase()
  })
}
