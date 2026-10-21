import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconMuscles } from '../ui/icons'

export default function MusclesPage() {
  return (
    <>
      <PageHeader title="Muscles" />
      <EmptyState icon={<IconMuscles size={20} />} title="Coming together">
        Volume, frequency and balance per muscle group will appear here.
      </EmptyState>
    </>
  )
}
