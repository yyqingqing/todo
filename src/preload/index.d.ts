export {}

declare global {
  interface Window {
    /** 阶段 0 占位。阶段 1 替换为 shared/ipc-contract 里的 Api 类型 */
    api: Record<string, unknown>
  }
}
