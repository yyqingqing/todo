# 青青 · 任务计划 + 每日 Todolist

一天一点，慢慢长成。

Windows 优先的桌面效率应用：计划树 + 每日清单 + 置顶悬浮窗 + 日历 + 积分。

设计决策与取舍在文档里，不在代码注释里：
- [需求评估与方案](docs/00-需求评估与方案.md) —— 为什么这样拆分概念、三种悬浮窗形态的取舍
- [实施计划](docs/01-实施计划.md) —— 数据模型、IPC 契约、阶段划分与验收标准

## 技术栈

| 层     | 选型                                                   |
| ------ | ------------------------------------------------------ |
| 桌面壳 | Electron 45                                            |
| 界面   | React 19 + TypeScript 7（strict）                      |
| 构建   | Vite 8 + electron-vite 6                               |
| 样式   | Tailwind CSS 4 + 语义 token                            |
| 数据   | `node:sqlite`（Node 内置，无原生编译）                 |
| 质量   | Biome（格式化 + lint）、Vitest、Playwright（视觉自检） |

## 开发

```bash
pnpm install     # postinstall 会自动检查/下载 Electron 二进制
pnpm dev         # 启动开发环境（主进程与界面都有 HMR）

pnpm typecheck   # 类型检查（node 侧 + web 侧分别检查）
pnpm lint        # Biome 检查并修复
pnpm test        # Vitest，只测 domain 层纯函数
pnpm build       # 构建到 out/
pnpm shot        # Playwright 截图自检 → .shots/（需先 build）
pnpm package     # 打 Windows 安装包 → dist/青青-<版本>-setup.exe
```

## 打包

```bash
pnpm package
```

产物是 NSIS 安装包（`dist/青青-<版本>-setup.exe`），支持：
- **自选安装位置**（不做一键安装）
- 装到当前用户下，不需要管理员权限
- 卸载时如果检测到数据，会询问是否备份到「文档\青青」

**数据跟着安装位置走**：打包后数据库在 `<安装目录>\data\qingqing.db`，
而不是 `%APPDATA%`。装到 D 盘，数据就在 D 盘。

唯一的例外：如果装到了 `Program Files` 这类普通用户不可写的位置，
会自动回落到 `%APPDATA%\Qingqing`（启动时用探针文件实测写权限，不靠猜）。
设置页的「存储位置」显示的是实际生效路径。

网络受限时打包会在下载 NSIS 工具链时卡住（`connect ETIMEDOUT` 到 GitHub），
用镜像：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
pnpm exec electron-builder --win
```

## 目录约定

```
src/
├─ main/      主进程：窗口、IPC、数据库。不含业务规则
├─ preload/   contextBridge，渲染进程唯一的出口
├─ shared/    主/渲染共享。domain/ 是纯函数，禁止 import electron
└─ renderer/  界面。只通过 window.api 拿数据
```

硬约束：`shared/` 不许 import electron / fs，这样 domain 层单测不需要跑在 Electron 里。

## 设计约定

- 色值、间距、字号**只能**来自 `src/renderer/src/styles/tokens.css`。组件里写裸 hex 是错误。
- 产品形态按 **Preset B（工具型）**：4pt 网格、描边优先于阴影、正文 14px。今日页与悬浮窗例外，行高放大到 48px。
- 日期一律用本地 `YYYY-MM-DD` 字符串；时间戳一律 UTC ISO。两者不混用。
- 每个页面必须做四态：加载 / 空 / 错误 / 无数据。

## 已知坑

1. **`ELECTRON_RUN_AS_NODE=1` 会让应用起不来**
   某些终端或 IDE 会带这个变量，Electron 会退化成纯 Node 模式，报
   `Cannot read properties of undefined (reading 'isPackaged')` 或 `app` 的任何属性为 undefined。
   启动前清掉即可（PowerShell）：`Remove-Item Env:ELECTRON_RUN_AS_NODE`

2. **pnpm 11+ 的配置位置变了**
   `nodeLinker`、`allowBuilds` 只认 `pnpm-workspace.yaml`；写在 `.npmrc` 或 `package.json#pnpm` 里会被
   静默忽略（不报错，但也不生效）。`.npmrc` 现在只剩 auth 与 registry。

3. **TypeScript 7 移除了 `baseUrl`**
   `paths` 必须用相对路径（`./src/shared/*`），否则 `tsc` 直接报 TS5102。

4. **Electron 45 不再自带 postinstall**
   二进制由 `scripts/ensure-electron.mjs` 负责，幂等：已存在就跳过。

5. **视觉自检不要用桌面截屏**
   高 DPI 下 PowerShell 的 `CopyFromScreen` 会因进程非 DPI 感知而截偏。
   用 `pnpm shot`（Playwright 直接驱动 Electron，拿的是页面而不是屏幕）。

6. **dev 版与安装版不能同时运行**
   两者共用 `app.setName('Qingqing')`，单实例锁互斥。测安装版前先关掉 `pnpm dev`，
   否则安装版启动后立刻退出，看起来像「打包坏了」。

7. **打包时 `build/icon.png` 必须在 `files` 里**
   托盘图标是运行时用 `app.getAppPath()` 读的，漏了它安装版就没有托盘图标
   （dev 下正常，只有打包后才暴露）。
