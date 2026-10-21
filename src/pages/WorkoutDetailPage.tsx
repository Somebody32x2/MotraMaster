import { paths } from '../router'
import { dataset } from '../state'
import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconWorkouts } from '../ui/icons'

export default function WorkoutDetailPage({ workoutId }: { workoutId: string }) {
  const ds = dataset.value
  const title = ds?.workouts.find((w) => w.id === workoutId)?.title ?? 'Workout'
  return (
    <>
      <PageHeader eyebrow="Workout" title={title} back={{ path: paths.workouts(), label: 'All workouts' }} />
      <EmptyState icon={<IconWorkouts size={20} />} title="Coming together">
        The full set-by-set breakdown of this session will appear here.
      </EmptyState>
    </>
  )
}
