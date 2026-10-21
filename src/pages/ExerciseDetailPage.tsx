import { displayLabel } from '../core/labels'
import { paths } from '../router'
import { dataset } from '../state'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconExercises } from '../ui/icons'

export default function ExerciseDetailPage({ exerciseKey }: { exerciseKey: string }) {
  const ds = dataset.value
  const title = ds?.exercises[exerciseKey]?.name ?? displayLabel(exerciseKey)
  return (
    <>
      <PageHeader eyebrow="Exercise" title={title} back={{ path: paths.exercises(), label: 'All exercises' }} />
      <EmptyState icon={<IconExercises size={20} />} title="Coming together">
        Progress and estimated 1RM for this exercise will appear here.
      </EmptyState>
    </>
  )
}
