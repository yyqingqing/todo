import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/cn'

interface MarkdownProps {
  children: string
  className?: string
}

/**
 * Markdown 渲染。
 *
 * 用 react-markdown 而不是 marked + dangerouslySetInnerHTML：
 * react-markdown 输出 React 元素、默认不渲染原始 HTML，
 * 用户粘贴进来的 <script> / onerror 之类不会被执行。
 * 这个应用虽然只有本人使用，但"备注"是最容易被粘贴进外部内容的地方。
 *
 * 链接点击会被主进程的 will-navigate 拦下并交给系统浏览器，不会在应用内导航。
 */
export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn('markdown-body', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
