import { EmptyState } from '../ui/components/EmptyState'
import { PageHeader } from '../ui/components/PageHeader'
import { IconExercises } from '../ui/icons'

export default function ExercisesPage() {
  return (
    <>
      <PageHeader title="Exercises" />
      <EmptyState icon={<IconExercises size={20} />} title="Coming together">
        Every exercise you have logged, with estimated 1RM and progress, will appear here.
      </EmptyState>
    </>
  )
}
