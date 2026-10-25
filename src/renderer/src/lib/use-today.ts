import { useEffect, useState } from 'react'
import { todayStr } from './date'

/**
 * 当前"今天"的日期字符串，跨零点自动更新。
 *
 * 两个触发源缺一不可：
 * 1. 定时器算到下一个零点 —— 应用一直开着时要自动切日
 * 2. 窗口重新聚焦时校正 —— 电脑休眠后定时器可能晚触发，甚至被节流到不触发
 *
 * 顺带说明为什么用 state 而不是每次渲染现算：
 * 现算的话，零点那一刻 React 不会重渲染，界面就停在昨天。
 */
export function useToday(): { today: string } {
  const [today, setToday] = useState(todayStr)

  useEffect(() => {
    let timer: number | undefined

    const schedule = (): void => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      // 多等 500ms，避免边界上算出来的还是前一天
      const delay = nextMidnight.getTime() - now.getTime() + 500

      timer = window.setTimeout(() => {
        setToday(todayStr())
        schedule()
      }, delay)
    }

    schedule()

    const onFocus = (): void => setToday(todayStr())
    window.addEventListener('focus', onFocus)

    // 定时器必须清理：HMR 或重复挂载时不清会积累一串定时器
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return { today }
}
