import { Layers } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'

export default function PlansPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="计划" />
      <EmptyState
        icon={Layers}
        title="还没有计划"
        description="先建一个带起止时间的计划，比如「三个月背完一本单词书」「一百天练完一本字帖」，再把它拆成更小的阶段或具体任务。"
      />
    </div>
  )
}
