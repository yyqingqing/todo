import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, nativeTheme, shell } from 'electron'

/**
 * 窗口级背景色。Electron 在创建窗口时就要这个值，此时 CSS 变量还没加载。
 * 必须与 styles/tokens.css 的 --canvas 一致，否则启动瞬间会闪一下白/黑。
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
      // sandbox 关闭是为了 preload 侧能访问 Node；安全边界由 contextIsolation 承担
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow = win

  // 等首屏渲染完再显示，避免白底闪屏
  win.on('ready-to-show', () => win.show())

  // 外部链接一律交给系统浏览器，应用内不开新窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (is.dev && rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => {
    mainWindow = null
  })
}

void app.whenReady().then(() => {
  // Windows 通知与任务栏分组依赖它
  electronApp.setAppUserModelId('com.todo.desktop')

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

// 单实例：多开会导致两个进程同时写 sqlite
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
