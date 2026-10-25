import { ListChecks } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import { todayLabel } from '../lib/date'

export default function TodayPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="今日" meta={todayLabel()} />
      <EmptyState
        icon={ListChecks}
        title="今天还没有安排"
        description="回车即可添加一条待办；也可以从「计划」里把任务拉到今天。"
      />
    </div>
  )
}
