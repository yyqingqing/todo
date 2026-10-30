import { addDaysLocal } from '@shared/domain/study'
import { IPC } from '@shared/ipc-contract'
import type { StudyEndReason, StudySession, StudyStatus } from '@shared/types'
import { BrowserWindow, Notification } from 'electron'
import { broadcastDataChanged } from '../broadcast'
import { getDb } from '../db/connection'
import {
  closeSession,
  insertSession,
  listSessionsBetween,
  recoverOpenSessions,
  touchSession,
} from '../db/repo/study.repo'
import { dayStartIso } from './stats'

/** 心跳间隔：崩溃最多丢这么久，用户感知不到 */
const HEARTBEAT_MS = 15_000
/** 单次会话超过这个时长就提醒一次（只提醒，不中止） */
const LONG_SESSION_SECONDS = 4 * 60 * 60
/** 提醒后至少隔这么久才再次提醒，避免每秒都弹 */
const REMINDER_REPEAT_MS = 60 * 60 * 1000

interface ActiveStudy {
  id: string
  /** UTC ISO，落库用；渲染进程的倒计时不依赖它 */
  startedAt: string
  /** 单调时钟读数：算时长不受系统时间调整影响 */
  startedMonotonic: bigint
  lastReminderAt: number
}

let active: ActiveStudy | null = null
let heartbeat: ReturnType<typeof setInterval> | null = null

function elapsedSeconds(): number {
  if (!active) return 0
  const seconds = Number(process.hrtime.bigint() - active.startedMonotonic) / 1e9
  return Math.max(0, Math.floor(seconds))
}

export function getStudyStatus(): StudyStatus {
  if (!active) return { running: false, startedAt: null, elapsedSeconds: 0 }
  return { running: true, startedAt: active.startedAt, elapsedSeconds: elapsedSeconds() }
}

/**
 * 开始计时。
 *
 * 幂等：已经在计时就直接返回当前状态。双击按钮、快捷键重复触发都不会多开一条。
 * 唯一索引是最后一道防线 —— 真出现两条 running，SQLite 会直接报错，而不是静默串账。
 */
export function startStudy(): StudyStatus {
  if (active) return getStudyStatus()

  const startedAt = new Date().toISOString()
  const { id } = insertSession(getDb(), startedAt)

  active = { id, startedAt, startedMonotonic: process.hrtime.bigint(), lastReminderAt: 0 }
  startHeartbeat()
  broadcastDataChanged('study')
  return getStudyStatus()
}

/**
 * 结束计时并落库。
 *
 * reason 决定明细里怎么显示：用户点的、退出时收的、休眠时收的、崩溃后回收的。
 * 时长用单调时钟算 —— 计时期间用户改系统时间不会把时长算成负数或几小时。
 */
export function stopStudy(reason: StudyEndReason = 'manual'): StudyStatus {
  if (!active) return getStudyStatus()

  const seconds = elapsedSeconds()
  const endedAt = new Date().toISOString()
  closeSession(getDb(), active.id, { endedAt, durationSeconds: seconds, endReason: reason })

  active = null
  stopHeartbeat()
  broadcastDataChanged('study')
  return getStudyStatus()
}

function startHeartbeat(): void {
  if (heartbeat) return
  heartbeat = setInterval(tick, HEARTBEAT_MS)
}

function stopHeartbeat(): void {
  if (!heartbeat) return
  clearInterval(heartbeat)
  heartbeat = null
}

function tick(): void {
  if (!active) return

  touchSession(getDb(), active.id, new Date().toISOString())

  const seconds = elapsedSeconds()
  if (seconds >= LONG_SESSION_SECONDS && Date.now() - active.lastReminderAt >= REMINDER_REPEAT_MS) {
    active.lastReminderAt = Date.now()
    remindLongSession()
  }
}

/**
 * 长会话提醒。
 *
 * 只提醒，绝不自动结束：4 小时以上很可能是正常的长课/整段刷题，
 * 擅自截断等于替用户改数据。
 */
function remindLongSession(): void {
  const status = getStudyStatus()

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.studyLongSession, status)
  }

  // 主窗口可能缩在托盘里，界面弹窗没人看得到，补一条系统通知
  if (Notification.isSupported()) {
    new Notification({
      title: '学习计时已满 4 小时',
      body: '还在继续计时。如果已经结束，记得点「结束计时」。',
    }).show()
  }
}

/** 本地日期闭区间内的已结束会话 */
export function listStudySessions(from: string, to: string): StudySession[] {
  return listSessionsBetween(getDb(), dayStartIso(from), dayStartIso(addDaysLocal(to, 1)))
}

/**
 * 启动时调用：回收上次没正常结束的会话，并把休眠处理挂上。
 *
 * 顺序很重要 —— 必须在建窗口之前跑完，否则界面可能先读到"还在计时"的旧行。
 */
export function initStudyTracking(): void {
  const recovered = recoverOpenSessions(getDb())
  if (recovered > 0) {
    console.log(`[study] 回收了 ${recovered} 条未正常结束的计时记录`)
  }
}

/** 退出前调用：把正在跑的会话正常收尾，别让它变成"崩溃" */
export function disposeStudyTracking(): void {
  stopStudy('quit')
  stopHeartbeat()
}
