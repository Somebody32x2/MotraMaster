import type { ComponentType } from 'preact'
import { useEffect } from 'preact/hooks'
import { displayLabel } from './core/labels'
import { isRegionId, regionName } from './core/regions'
import CalendarPage from './pages/CalendarPage'
import ExerciseDetailPage from './pages/ExerciseDetailPage'
import ExercisesPage from './pages/ExercisesPage'
import ImportPage from './pages/ImportPage'
import MuscleDetailPage from './pages/MuscleDetailPage'
import MusclesPage from './pages/MusclesPage'
import OverviewPage from './pages/OverviewPage'
import SettingsPage from './pages/SettingsPage'
import WorkoutDetailPage from './pages/WorkoutDetailPage'
import WorkoutsPage from './pages/WorkoutsPage'
import { href, navigate, paths, route, type RouteName } from './router'
import { boot, dataset, loading } from './state'
import { isDataRoute } from './ui/components/PageControls'
import { Skeleton } from './ui/components/Skeleton'
import {
  IconCalendar,
  IconExercises,
  IconImport,
  IconMuscles,
  IconOverview,
  IconSettings,
  IconWorkouts,
  type IconProps,
} from './ui/icons'

interface NavItem {
  path: string
  label: string
  icon: ComponentType<IconProps>
  /** Route names that mark this item as current. */
  match: RouteName[]
}

const NAV_MAIN: NavItem[] = [
  { path: paths.overview(), label: 'Overview', icon: IconOverview, match: ['overview'] },
  { path: paths.muscles(), label: 'Muscles', icon: IconMuscles, match: ['muscles', 'muscle'] },
  { path: paths.exercises(), label: 'Exercises', icon: IconExercises, match: ['exercises', 'exercise'] },
  { path: paths.workouts(), label: 'Workouts', icon: IconWorkouts, match: ['workouts', 'workout'] },
  { path: paths.calendar(), label: 'Calendar', icon: IconCalendar, match: ['calendar'] },
]

const isCurrent = (item: NavItem) => item.match.includes(route.value.name)

function TopNav() {
  const name = route.value.name
  return (
    <header class="topnav">
      <div class="topnav__inner">
        <a class="wordmark" href={href(paths.overview())} aria-label="MotraMaster home">
          Motra<span class="wordmark__sub">Master</span>
        </a>
        <nav class="topnav__links" aria-label="Main">
          {NAV_MAIN.map((item) => (
            <a
              key={item.path}
              class="topnav__link"
              href={href(item.path)}
              aria-current={isCurrent(item) ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div class="topnav__actions">
          <a
            class="icon-btn"
            href={href(paths.import())}
            aria-label="Import"
            title="Import"
            aria-current={name === 'import' ? 'page' : undefined}
          >
            <IconImport />
          </a>
          <a
            class="icon-btn"
            href={href(paths.settings())}
            aria-label="Settings"
            title="Settings"
            aria-current={name === 'settings' ? 'page' : undefined}
          >
            <IconSettings />
          </a>
        </div>
      </div>
    </header>
  )
}

/** Mobile: the five data sections; Import and Settings stay in the top bar. */
function TabBar() {
  return (
    <nav class="tabbar" aria-label="Main">
      {NAV_MAIN.map((item) => {
        const Icon = item.icon
        return (
          <a key={item.path} class="tabbar__item" href={href(item.path)} aria-current={isCurrent(item) ? 'page' : undefined}>
            <Icon />
            <span>{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}

const SECTION_LABEL: Record<RouteName, string> = {
  overview: 'Overview',
  muscles: 'Muscles',
  muscle: 'Muscles',
  exercises: 'Exercises',
  exercise: 'Exercises',
  workouts: 'Workouts',
  workout: 'Workouts',
  calendar: 'Calendar',
  import: 'Import',
  settings: 'Settings',
}

/** Name of the entity shown by a detail route, or null for section pages. */
function detailTitle(): string | null {
  const { name, params } = route.value
  const ds = dataset.value
  if (name === 'muscle') return isRegionId(params.key) ? regionName(params.key) : displayLabel(params.key)
  if (name === 'exercise') return ds?.exercises[params.key]?.name ?? displayLabel(params.key)
  if (name === 'workout') return ds?.workouts.find((w) => w.id === params.id)?.title ?? 'Workout'
  return null
}

function Page({ onboarding }: { onboarding: boolean }) {
  const { name, params } = route.value
  if (onboarding) return <ImportPage />
  switch (name) {
    case 'overview':
      return <OverviewPage />
    case 'muscles':
      return <MusclesPage />
    case 'muscle':
      return <MuscleDetailPage muscleKey={params.key} />
    case 'exercises':
      return <ExercisesPage />
    case 'exercise':
      return <ExerciseDetailPage exerciseKey={params.key} />
    case 'workouts':
      return <WorkoutsPage />
    case 'workout':
      return <WorkoutDetailPage workoutId={params.id} />
    case 'calendar':
      return <CalendarPage />
    case 'import':
      return <ImportPage />
    case 'settings':
      return <SettingsPage />
  }
}

function BootSkeleton() {
  return (
    <div class="stack" style={{ '--gap': 'var(--s3)' }} aria-busy="true" aria-label="Loading your data">
      <Skeleton width={220} height={28} />
      <Skeleton width={360} height={14} />
      <div class="boot-strip">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width={120} height={56} />
        ))}
      </div>
      <Skeleton height={280} radius={10} />
    </div>
  )
}

export function App() {
  const r = route.value
  const ds = dataset.value
  const isLoading = loading.value
  const onboarding = !isLoading && !ds && isDataRoute(r.name)

  useEffect(() => {
    void boot().then(() => {
      if (!dataset.value && isDataRoute(route.value.name)) navigate(paths.import(), { replace: true })
    })
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [r.path])

  const detail = detailTitle()
  const title = onboarding ? 'Import' : (detail ?? SECTION_LABEL[r.name])
  useEffect(() => {
    document.title = `${title} · MotraMaster`
  }, [title])

  const narrow = onboarding || r.name === 'import'

  return (
    <div class="shell">
      <TopNav />
      <main class={narrow ? 'content content--narrow' : 'content'} key={r.path} id="main">
        {isLoading ? <BootSkeleton /> : <Page onboarding={onboarding} />}
      </main>
      <TabBar />
    </div>
  )
}
