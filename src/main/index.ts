import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { PRODUCT } from '@shared/product'
import { app, BrowserWindow, nativeTheme, session, shell } from 'electron'

/**
 * 窗口级背景色。Electron 建窗口时就要这个值，此时 CSS 变量还没加载。
 * 必须与 styles/tokens.css 的 --canvas 一致，否则启动瞬间会闪一下。
 */
const WINDOW_BG = { light: '#f7f8fa', dark: '#0f1319' } as const

let mainWindow: BrowserWindow | null = null

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
  win.on('ready-to-show', () => win.show())
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

  // 所有 webContents（含将来的悬浮窗）共用一套外链策略，避免逐个窗口设置时漏掉
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
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId(PRODUCT.appId)
    harden()

    // dev 下 F12 开 DevTools、F5 刷新（生产环境自动不生效）
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
