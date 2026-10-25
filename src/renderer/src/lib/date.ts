import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

/**
 * 全项目"今天"的唯一入口。
 *
 * 约定：所有日历日都用本地 YYYY-MM-DD 字符串表示，绝不用 UTC 时间戳反推。
 * 原因：跨零点、夏令时、以后跨设备同步时，"今天"必须跟着人的所在地走。
 */
export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** 页面标题用，如 "10月25日 周六" */
export function todayLabel(): string {
  return format(new Date(), 'M月d日 EEEE', { locale: zhCN })
}

/** 判断某个 YYYY-MM-DD 是不是今天 */
export function isToday(dateStr: string): boolean {
  return dateStr === todayStr()
}
