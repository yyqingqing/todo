/**
 * 全项目"今天"的唯一入口。
 *
 * 约定：所有日历日都用本地 YYYY-MM-DD 字符串表示，绝不用 UTC 时间戳反推。
 * 原因：跨零点、夏令时、以后跨设备同步时，"今天"必须跟着人的所在地走。
 *
 * 这里刻意不引入 date-fns：只取年月日的话原生 Date 就够，
 * 能把整个日期库从首屏 bundle 里摘掉。日历页需要做月份运算时再按子路径引入。
 */

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地日历日，YYYY-MM-DD */
export function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

/** 页面标题用，如 "10月25日 星期六" */
export function todayLabel(): string {
  const now = new Date()
  const weekday = WEEKDAY_LABELS[now.getDay()] ?? ''
  return `${now.getMonth() + 1}月${now.getDate()}日 星期${weekday}`
}

/** 判断某个 YYYY-MM-DD 是不是今天 */
export function isToday(dateStr: string): boolean {
  return dateStr === todayStr()
}

/** 按本地日历日加减，跨月跨年交给 Date 处理 */
export function addDays(dateStr: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** "2026-10-25" -> "10月25日"；不是今年时带上年份 */
export function formatDateLabel(dateStr: string): string {
  const [year = 1970, month = 1, day = 1] = dateStr.split('-').map(Number)
  return year === new Date().getFullYear() ? `${month}月${day}日` : `${year}年${month}月${day}日`
}

/** 计划区间的展示文案："10月25日 – 11月24日" */
export function formatRange(startDate: string, endDate: string): string {
  return `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`
}
