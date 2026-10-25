import type { Plan } from '@shared/types'
import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Dialog from '../../components/Dialog'
import MarkdownLazy from '../../components/MarkdownLazy'
import { cn } from '../../lib/cn'
import { addDays, todayStr } from '../../lib/date'
import { fieldErrorClass, inputClass, labelClass, textareaClass } from '../../lib/ui'
import { useCategories, usePlanMutations } from './api'

const NOTE_TABS = [
  { value: 'edit', label: '编辑' },
  { value: 'preview', label: '预览' },
] as const

interface PlanFormDialogProps {
  open: boolean
  /** null 表示新建 */
  plan: Plan | null
  /** 新建时的父计划 id */
  parentId: string | null
  onClose: () => void
}

/**
 * 新建 / 编辑计划。
 *
 * 表单用手写 state 而不是 react-hook-form：这里只有 4 个字段、校验规则 3 条，
 * 引 25KB 的表单库不划算。等表单复杂到字段间联动时再换。
 */
export default function PlanFormDialog({ open, plan, parentId, onClose }: PlanFormDialogProps) {
  const { savePlan } = usePlanMutations()
  const { data: categories = [] } = useCategories()

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(() => addDays(todayStr(), 30))
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [noteTab, setNoteTab] = useState<'edit' | 'preview'>('edit')
  const [error, setError] = useState<string | null>(null)

  // 每次打开都重置成初始值，避免上一次的输入残留
  useEffect(() => {
    if (!open) return
    setError(null)
    setTitle(plan?.title ?? '')
    setStartDate(plan?.startDate ?? todayStr())
    setEndDate(plan?.endDate ?? addDays(todayStr(), 30))
    setCategoryId(plan?.categoryId ?? '')
    setNote(plan?.note ?? '')
    setNoteTab('edit')
  }, [open, plan])

  const submit = async (): Promise<void> => {
    const trimmed = title.trim()
    if (trimmed.length === 0) {
      setError('标题不能为空')
      return
    }
    if (endDate < startDate) {
      setError('结束日期不能早于开始日期')
      return
    }

    try {
      setError(null)
      await savePlan.mutateAsync({
        id: plan?.id,
        parentId: plan ? plan.parentId : parentId,
        categoryId: categoryId === '' ? null : categoryId,
        title: trimmed,
        note: note.trim() === '' ? null : note.trim(),
        startDate,
        endDate,
      })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败')
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={plan ? '编辑计划' : parentId ? '新建子计划' : '新建计划'}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={savePlan.isPending}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-title" className={labelClass}>
          标题
        </label>
        <input
          id="plan-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="比如：三个月背完一本单词书"
          autoComplete="off"
          className={inputClass}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="plan-start" className={labelClass}>
            开始日期
          </label>
          <input
            id="plan-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="plan-end" className={labelClass}>
            结束日期
          </label>
          <input
            id="plan-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="plan-category" className={labelClass}>
          分类
        </label>
        <select
          id="plan-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className={inputClass}
        >
          <option value="">未分类</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="plan-note" className={labelClass}>
            备注
          </label>
          <div className="flex gap-0.5 rounded bg-panel-sunken p-0.5">
            {NOTE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={noteTab === tab.value}
                onClick={() => setNoteTab(tab.value)}
                className={cn(
                  'rounded-sm px-2 py-0.5 text-[11px] transition-colors',
                  noteTab === tab.value
                    ? 'bg-panel font-medium text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {noteTab === 'edit' ? (
          <textarea
            id="plan-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={6}
            placeholder={'支持 Markdown：\n# 标题\n- 列表项\n**加粗**、`代码`'}
            className={textareaClass}
          />
        ) : (
          <div className="min-h-[132px] rounded-md border border-line bg-panel px-2.5 py-2">
            {note.trim() ? (
              <MarkdownLazy>{note}</MarkdownLazy>
            ) : (
              <p className="text-xs text-ink-subtle">还没有内容</p>
            )}
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </Dialog>
  )
}
