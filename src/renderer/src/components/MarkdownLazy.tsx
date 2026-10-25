import { lazy, Suspense } from 'react'

/**
 * Markdown 渲染的懒加载包装。
 *
 * react-markdown + remark-gfm 会把主 bundle 撑大约 600KB（remark 全家桶），
 * 而备注只在「打开计划详情」和「切到预览」时才用得到。
 * 拆成独立 chunk 后，首屏不再为它付出代价。
 *
 * 代价是第一次展示备注会有一瞬间的占位文本。相比每次启动都多解析 600KB，这笔交换划算。
 */
const MarkdownInner = lazy(() => import('./Markdown'))

interface MarkdownLazyProps {
  children: string
}

export default function MarkdownLazy({ children }: MarkdownLazyProps) {
  return (
    <Suspense fallback={<p className="text-xs text-ink-subtle">渲染中…</p>}>
      <MarkdownInner>{children}</MarkdownInner>
    </Suspense>
  )
}
