import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import Button from '../../components/Button'
import Dialog from '../../components/Dialog'
import { cn } from '../../lib/cn'
import { fieldErrorClass, inputClass } from '../../lib/ui'
import { useCategories, usePlanMutations } from './api'
import { CATEGORY_COLORS, colorStyle } from './colors'

interface CategoryDialogProps {
  open: boolean
  onClose: () => void
}

export default function CategoryDialog({ open, onClose }: CategoryDialogProps) {
  const { data: categories = [] } = useCategories()
  const { saveCategory, removeCategory } = usePlanMutations()

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    try {
      setError(null)
      await saveCategory.mutateAsync({ name: trimmed, color })
      setName('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="分类">
      {categories.length === 0 ? (
        <p className="text-sm text-ink-muted">
          还没有分类。分类用于给计划上色和筛选，可以先建「学习」「工作」「生活」。
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex h-9 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-panel-hover"
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={colorStyle(category.color)}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{category.name}</span>
              <button
                type="button"
                onClick={() => {
                  removeCategory.mutate(category.id)
                }}
                aria-label={`删除分类「${category.name}」`}
                className="flex size-7 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-2 border-t border-line pt-4"
      >
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="新分类名称"
            aria-label="新分类名称"
            className={inputClass}
          />
          <Button type="submit" disabled={name.trim().length === 0 || saveCategory.isPending}>
            添加
          </Button>
        </div>

        <fieldset className="flex gap-2">
          <legend className="sr-only">分类颜色</legend>
          {CATEGORY_COLORS.map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => setColor(token)}
              aria-label={`选择颜色 ${token}`}
              aria-pressed={color === token}
              className={cn(
                'size-6 rounded-full ring-offset-2 ring-offset-panel transition-shadow',
                color === token ? 'ring-2 ring-ink' : 'ring-0',
              )}
              style={colorStyle(token)}
            />
          ))}
        </fieldset>

        {error ? (
          <p role="alert" className={fieldErrorClass}>
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  )
}
