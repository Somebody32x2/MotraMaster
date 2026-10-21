import type { ComponentType } from 'preact'
import { useEffect } from 'preact/hooks'
import { displayLabel } from './core/labels'
import type { DetailLevel, ThemePref } from './core/types'
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
import { boot, dataset, loading, range, RANGE_OPTIONS, settings, updateSettings } from './state'
import { Segmented, type SegmentedOption } from './ui/components/Segmented'
import { Skeleton } from './ui/components/Skeleton'
import { formatRelative, plural } from './ui/format'
import {
  IconExercises,
  IconImport,
  IconMoon,
  IconMuscles,
  IconOverview,
  IconSettings,
  IconSun,
  IconSystem,
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
]

const NAV_IMPORT: NavItem = { path: paths.import(), label: 'Import', icon: IconImport, match: ['import'] }
const NAV_SETTINGS: NavItem = { path: paths.settings(), label: 'Settings', icon: IconSettings, match: ['settings'] }

/** Pages that need a dataset; without one the onboarding/import view is shown instead. */
const DATA_ROUTES: RouteName[] = ['overview', 'muscles', 'muscle', 'exercises', 'exercise', 'workouts', 'workout']

const DETAIL_OPTIONS: SegmentedOption<DetailLevel>[] = [
  { value: 'normal', label: 'Normal', title: 'Essential statistics' },
  { value: 'detailed', label: 'Detailed', title: 'Every statistic and breakdown' },
]

const THEME_OPTIONS: SegmentedOption<ThemePref>[] = [
  { value: 'system', label: <IconSystem size={16} />, title: 'Match system theme' },
  { value: 'light', label: <IconSun size={16} />, title: 'Light theme' },
  { value: 'dark', label: <IconMoon size={16} />, title: 'Dark theme' },
]

function NavLink({ item, variant }: { item: NavItem; variant: 'nav' | 'tab' }) {
  const current = item.match.includes(route.value.name)
  const Icon = item.icon
  return (
    <a
      class={variant === 'nav' ? 'nav__item' : 'tabbar__item'}
      href={href(item.path)}
      aria-current={current ? 'page' : undefined}
    >
      <Icon />
      <span>{item.label}</span>
    </a>
  )
}

function Brand() {
  return (
    <a class="brand" href={href(paths.overview())} aria-label="MotraMaster home">
      <img class="brand__mark" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
      <span>
        Motra<span class="brand__sub">Master</span>
      </span>
    </a>
  )
}

function Sidebar() {
  const ds = dataset.value
  return (
    <aside class="sidebar">
      <Brand />
      <nav class="nav" aria-label="Main">
        {NAV_MAIN.map((item) => (
          <NavLink key={item.path} item={item} variant="nav" />
        ))}
      </nav>
      <div class="sidebar__foot">
        <nav class="nav" aria-label="Data and preferences">
          <NavLink item={NAV_IMPORT} variant="nav" />
          <NavLink item={NAV_SETTINGS} variant="nav" />
        </nav>
        {ds && (
          <p class="sidebar__meta">
            <strong>{plural(ds.workouts.length, 'workout')}</strong>
            <br />
            Imported {formatRelative(new Date(ds.importedAt))}
          </p>
        )}
      </div>
    </aside>
  )
}

function TabBar() {
  return (
    <nav class="tabbar" aria-label="Main">
      {NAV_MAIN.map((item) => (
        <NavLink key={item.path} item={item} variant="tab" />
      ))}
      <NavLink item={NAV_SETTINGS} variant="tab" />
    </nav>
  )
}

const SECTION: Record<RouteName, { label: string; path: string }> = {
  overview: { label: 'Overview', path: paths.overview() },
  muscles: { label: 'Muscles', path: paths.muscles() },
  muscle: { label: 'Muscles', path: paths.muscles() },
  exercises: { label: 'Exercises', path: paths.exercises() },
  exercise: { label: 'Exercises', path: paths.exercises() },
  workouts: { label: 'Workouts', path: paths.workouts() },
  workout: { label: 'Workouts', path: paths.workouts() },
  import: { label: 'Import', path: paths.import() },
  settings: { label: 'Settings', path: paths.settings() },
}

/** Name of the entity shown by a detail route, or null for section pages. */
function detailTitle(): string | null {
  const { name, params } = route.value
  const ds = dataset.value
  if (name === 'muscle') return ds?.muscles[params.key]?.name ?? displayLabel(params.key)
  if (name === 'exercise') return ds?.exercises[params.key]?.name ?? displayLabel(params.key)
  if (name === 'workout') return ds?.workouts.find((w) => w.id === params.id)?.title ?? 'Workout'
  return null
}

function TopBar({ showDataControls }: { showDataControls: boolean }) {
  const section = SECTION[route.value.name]
  const detail = detailTitle()
  const s = settings.value
  return (
    <header class="topbar">
      <img
        class="topbar__mobile-brand"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        alt=""
        width={22}
        height={22}
      />
      <div class="topbar__title">
        {detail ? (
          <>
            <a href={href(section.path)}>{section.label}</a>
            <span class="topbar__sep" aria-hidden="true">
              /
            </span>
            <span class="topbar__current" aria-current="page">
              {detail}
            </span>
          </>
        ) : (
          <span class="topbar__current">{section.label}</span>
        )}
      </div>
      <div class="topbar__actions">
        <a class="icon-btn" href={href(paths.import())} aria-label="Import" title="Import">
          <IconImport />
        </a>
      </div>
      <div class="topbar__controls">
        {showDataControls && (
          <>
            <Segmented
              label="Time range"
              options={RANGE_OPTIONS}
              value={range.value}
              onChange={(v) => {
                range.value = v
              }}
            />
            <Segmented
              label="Detail level"
              options={DETAIL_OPTIONS}
              value={s.detail}
              onChange={(detail) => updateSettings({ detail })}
            />
          </>
        )}
        <Segmented
          label="Theme"
          icons
          options={THEME_OPTIONS}
          value={s.theme}
          onChange={(theme) => updateSettings({ theme })}
        />
      </div>
    </header>
  )
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
    case 'import':
      return <ImportPage />
    case 'settings':
      return <SettingsPage />
  }
}

function BootSkeleton() {
  return (
    <div class="stack" aria-busy="true" aria-label="Loading your data">
      <Skeleton width={220} height={28} />
      <Skeleton width={360} height={14} />
      <div class="grid-4" style={{ marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={104} radius={14} />
        ))}
      </div>
      <Skeleton height={280} radius={14} />
    </div>
  )
}

export function App() {
  const r = route.value
  const ds = dataset.value
  const isLoading = loading.value
  const dataRoute = DATA_ROUTES.includes(r.name)
  const onboarding = !isLoading && !ds && dataRoute

  useEffect(() => {
    void boot().then(() => {
      if (!dataset.value && DATA_ROUTES.includes(route.value.name)) navigate(paths.import(), { replace: true })
    })
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [r.path])

  const detail = detailTitle()
  const title = onboarding ? 'Import' : (detail ?? SECTION[r.name].label)
  useEffect(() => {
    document.title = `${title} · MotraMaster`
  }, [title])

  const narrow = onboarding || r.name === 'import' || r.name === 'settings'

  return (
    <div class="shell">
      <Sidebar />
      <div class="main">
        <TopBar showDataControls={dataRoute && ds != null} />
        <main class={narrow ? 'content content--narrow' : 'content'} key={r.path} id="main">
          {isLoading ? <BootSkeleton /> : <Page onboarding={onboarding} />}
        </main>
      </div>
      <TabBar />
    </div>
  )
}
