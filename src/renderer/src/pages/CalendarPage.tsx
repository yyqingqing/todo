import { CalendarDays } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'

export default function CalendarPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="日历" />
      <EmptyState
        icon={CalendarDays}
        title="还没有可显示的内容"
        description="有了任务和计划之后，这里会按月展示计划跨度与每天的完成情况。"
      />
    </div>
  )
}
