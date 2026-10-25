/**
 * 品牌与身份的**唯一来源**。
 *
 * 改名 / 改 ID 只需要动这一个文件（外加 package.json 的 build 配置）。
 * 所以这里不放任何 UI 逻辑，也不 import 任何东西 —— 主进程、渲染进程、脚本都能用。
 */
export const PRODUCT = {
  /** 中文名：窗口标题、界面、安装包显示名 */
  name: '拾阶',
  /** 英文名：userData 目录、appId、安装包文件名。用英文避免中文路径带来的编码问题 */
  nameEn: 'Stepwise',
  /** 一句话定位，只出现在设置 - 关于 */
  tagline: '一步一级，长期可见',
  appId: 'com.stepwise.app',
} as const
