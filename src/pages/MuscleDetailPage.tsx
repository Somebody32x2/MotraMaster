import { displayLabel } from '../core/labels'
import { paths } from '../router'
import { dataset } from '../state'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconMuscles } from '../ui/icons'

export default function MuscleDetailPage({ muscleKey }: { muscleKey: string }) {
  const ds = dataset.value
  const title = ds?.muscles[muscleKey]?.name ?? displayLabel(muscleKey)
  return (
    <>
      <PageHeader eyebrow="Muscle" title={title} back={{ path: paths.muscles(), label: 'All muscles' }} />
      <EmptyState icon={<IconMuscles size={20} />} title="Coming together">
        Trends for this muscle group will appear here.
      </EmptyState>
    </>
  )
}
