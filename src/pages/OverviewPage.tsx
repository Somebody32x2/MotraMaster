import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconOverview } from '../ui/icons'

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview" />
      <EmptyState icon={<IconOverview size={20} />} title="Coming together">
        Training summary, trends and recent sessions for the selected range will appear here.
      </EmptyState>
    </>
  )
}
