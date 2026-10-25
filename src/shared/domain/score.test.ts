import { describe, expect, it } from 'vitest'
import { reasonLabel, SCORE_REASONS, SCORE_RULES, todoDonePoints, todoDoneReason } from './score'

describe('todoDonePoints', () => {
  it('当天完成得满分', () => {
    expect(todoDonePoints('2026-10-25', '2026-10-25')).toBe(SCORE_RULES.todoDone)
  })

  it('逾期完成只得逾期分', () => {
    expect(todoDonePoints('2026-10-23', '2026-10-25')).toBe(SCORE_RULES.todoLate)
  })

  it('提前完成（未来日期）按当天算，不给逾期分', () => {
    // scheduled_date 在完成日之后，说明是提前做的，不该被判定成逾期
    expect(todoDonePoints('2026-10-30', '2026-10-25')).toBe(SCORE_RULES.todoDone)
  })

  it('按时分严格高于逾期分，否则顺延就没有成本', () => {
    expect(SCORE_RULES.todoDone).toBeGreaterThan(SCORE_RULES.todoLate)
  })

  it('跨月、跨年的日期比较按字符串序也成立', () => {
    expect(todoDonePoints('2025-12-31', '2026-01-01')).toBe(SCORE_RULES.todoLate)
  })
})

describe('todoDoneReason', () => {
  it('当天完成 -> todo_done', () => {
    expect(todoDoneReason('2026-10-25', '2026-10-25')).toBe(SCORE_REASONS.todoDone)
  })

  it('逾期完成 -> todo_late', () => {
    expect(todoDoneReason('2026-10-24', '2026-10-25')).toBe(SCORE_REASONS.todoLate)
  })

  it('reason 与分值是同一个判定，不会出现「记了逾期分却写了按时」', () => {
    const pairs: [string, string][] = [
      ['2026-10-25', '2026-10-25'],
      ['2026-10-24', '2026-10-25'],
      ['2026-10-26', '2026-10-25'],
    ]
    for (const [scheduled, completed] of pairs) {
      const isLate = todoDonePoints(scheduled, completed) === SCORE_RULES.todoLate
      expect(todoDoneReason(scheduled, completed) === SCORE_REASONS.todoLate).toBe(isLate)
    }
  })
})

describe('reasonLabel', () => {
  it('已知 reason 给出中文文案', () => {
    expect(reasonLabel(SCORE_REASONS.todoDone)).toBe('完成今日待办')
    expect(reasonLabel(SCORE_REASONS.revoke)).toBe('取消完成')
  })

  it('未知 reason 原样返回，不抛错', () => {
    // 历史流水里可能有已经删掉的规则，页面对它必须仍然能渲染
    expect(reasonLabel('some_legacy_reason')).toBe('some_legacy_reason')
  })
})

describe('SCORE_RULES 的不变量', () => {
  it('全清奖励要求至少 2 条，否则单条清单天天都能刷奖励', () => {
    expect(SCORE_RULES.dailyClearMinItems).toBeGreaterThanOrEqual(2)
  })

  it('全清奖励分量足够，值得为它把清单做完', () => {
    expect(SCORE_RULES.dailyClear).toBeGreaterThan(SCORE_RULES.todoDone)
  })
})
