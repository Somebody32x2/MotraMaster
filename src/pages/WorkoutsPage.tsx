import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconWorkouts } from '../ui/icons'

export default function WorkoutsPage() {
  return (
    <>
      <PageHeader title="Workouts" />
      <EmptyState icon={<IconWorkouts size={20} />} title="Coming together">
        A searchable log of your sessions will appear here.
      </EmptyState>
    </>
  )
}
