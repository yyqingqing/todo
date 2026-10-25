/**
 * 分类可用的颜色 token。
 *
 * 数据库里只存 token 名（'cat-1'），不存 hex：
 * 换主题、换品牌色时分类颜色不用迁移数据，也不会出现"浅色好看深色刺眼"。
 *
 * 放在 lib 而不是某个 feature 下：今日清单也要用它标记"这条待办属于哪个计划的哪个分类"。
 */
export const CATEGORY_COLORS = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6'] as const

export type CategoryColor = (typeof CATEGORY_COLORS)[number]

/**
 * 兜底：库里的值可能是旧数据或被改坏。
 * 直接把它拼进 `var(--${color})` 之前必须过这一层，否则会拼出非法 CSS 变量名。
 */
export function safeColorToken(color: string | null | undefined): CategoryColor {
  const found = CATEGORY_COLORS.find((token) => token === color)
  return found ?? 'cat-1'
}

/** 取色块用的内联样式。颜色名是动态的，Tailwind 无法穷举 */
export function colorStyle(color: string | null | undefined): { backgroundColor: string } {
  return { backgroundColor: `var(--${safeColorToken(color)})` }
}
