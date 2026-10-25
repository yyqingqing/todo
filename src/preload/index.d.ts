import type { Api } from '@shared/ipc-contract'

declare global {
  interface Window {
    /** 由 preload 的 contextBridge 注入，形状见 shared/ipc-contract.ts */
    api: Api
  }
}
