import {
  addDaysLocal,
  computeStudyStats,
  localDayStartMs,
  pickGranularity,
} from '@shared/domain/study'
import type { StudyGranularity, StudyStats } from '@shared/types'
import { getDb } from '../db/connection'
import { listSessionsBetween } from '../db/repo/study.repo'

/**
 * 本地日期 -> 当天 0 点的 UTC ISO。
 *
 * 库里存的是 UTC ISO，查询区间必须换算成同一口径；
 * 直接用日期字符串去比会在 UTC+8 的凌晨错位 8 小时。
 */
export function dayStartIso(date: string): string {
  return new Date(localDayStartMs(date)).toISOString()
}

/**
 * 区间统计。
 *
 * 数据库只负责把"与区间有交集的会话"捞出来，切分和分桶全部交给纯函数 ——
 * 跨零点、周/月边界这些规则只有一处实现，也才有单测可写。
 */
export function getStudyStats(
  from: string,
  to: string,
  granularity?: StudyGranularity,
): StudyStats {
  const sessions = listSessionsBetween(getDb(), dayStartIso(from), dayStartIso(addDaysLocal(to, 1)))
  return computeStudyStats(sessions, from, to, granularity ?? pickGranularity(from, to))
}
