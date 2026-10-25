/**
 * Electron 45 起不再提供 postinstall，二进制需要显式下载。
 * 这个脚本做幂等检查：已存在就直接跳过，避免每次 install 白等。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electronRoot = join(require.resolve('electron/package.json'), '..')
const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron'
const exePath = join(electronRoot, 'dist', exeName)

if (existsSync(exePath)) {
  console.log('[ensure-electron] 二进制已就绪，跳过下载')
  process.exit(0)
}

console.log('[ensure-electron] 未找到 Electron 二进制，开始下载…')
const result = spawnSync(process.execPath, [join(electronRoot, 'install.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
  },
})

if (result.status !== 0) {
  console.error('[ensure-electron] 下载失败。可手动重试：pnpm exec install-electron')
}
process.exit(result.status ?? 1)
