import { BarChart3 } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'

export default function ScorePage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="积分" />
      <EmptyState
        icon={BarChart3}
        title="还没有积分记录"
        description="完成任务、清空当日清单、完成整个计划都会获得积分，每一笔的来源和分值都会记在这里。"
      />
    </div>
  )
}
