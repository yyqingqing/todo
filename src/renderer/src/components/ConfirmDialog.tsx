import Button from './Button'
import Dialog from './Dialog'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmText?: string
  /** 破坏性操作（删除等）用红色按钮 */
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 危险操作确认。
 * 删除计划会级联删掉所有子计划和任务，不给确认就是数据丢失。
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确认',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="420px"
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant={danger ? 'primary' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            className={danger ? 'bg-danger hover:bg-danger/90' : undefined}
          >
            {busy ? '处理中…' : confirmText}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-secondary">{description}</p>
    </Dialog>
  )
}
