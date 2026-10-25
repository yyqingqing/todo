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

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export interface MonthCell {
  date: string
  /** 是否属于当前月。前后补齐的格子是 false，界面上要置灰 */
  inMonth: boolean
}

/**
 * 生成月视图网格：周一为第一列，前后补齐到整周。
 * 中国日历习惯周一起始（工作日连在一起），不是周日。
 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  // JS 的 getDay() 里 0 是周日；转成「周一 = 0」的索引
  const leading = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells: MonthCell[] = []

  for (let offset = leading; offset > 0; offset -= 1) {
    cells.push({ date: toDateString(new Date(year, month - 1, 1 - offset)), inMonth: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: toDateString(new Date(year, month - 1, day)), inMonth: true })
  }

  while (cells.length % 7 !== 0) {
    const lastCell = cells.at(-1)
    if (!lastCell) break
    const [y = 1970, m = 1, d = 1] = lastCell.date.split('-').map(Number)
    cells.push({ date: toDateString(new Date(y, m - 1, d + 1)), inMonth: false })
  }

  return cells
}

/** 某月共有多少天 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** "2026-10-25" -> 25 */
export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10))
}
