import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * 只测 shared/domain 下的纯函数。
 *
 * 主进程的 repo/service 依赖 node:sqlite 与 Electron 运行时，单测成本高；
 * 那一层用 scripts/verify-*.mjs 的集成脚本覆盖。两层各管各的。
 */
export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(import.meta.dirname, 'src/shared') },
  },
  test: {
    include: ['src/shared/**/*.test.ts'],
    environment: 'node',
  },
})
