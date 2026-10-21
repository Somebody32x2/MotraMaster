import {
  ArrowLeft,
  Barbell,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CaretUp,
  ChartLineUp,
  Check,
  FileText,
  Info,
  ListBullets,
  LockSimple,
  Monitor,
  Moon,
  Person,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash,
  TrendUp,
  UploadSimple,
  Warning,
  X,
  type Icon,
} from '@phosphor-icons/react'

export interface IconProps {
  size?: number
  class?: string
  /** Accessible label; when omitted the icon is decorative (aria-hidden). */
  title?: string
}

/** Wraps a Phosphor glyph in the app's icon signature (regular weight, 18px default, decorative unless titled). */
function phosphor(Glyph: Icon) {
  return ({ size = 18, class: cls, title }: IconProps) => (
    <Glyph
      size={size}
      weight="regular"
      class={cls}
      alt={title}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    />
  )
}

export const IconOverview = phosphor(ChartLineUp)
export const IconMuscles = phosphor(Person)
export const IconExercises = phosphor(Barbell)
export const IconWorkouts = phosphor(ListBullets)
export const IconCalendar = phosphor(CalendarBlank)
export const IconImport = phosphor(UploadSimple)
export const IconSettings = phosphor(SlidersHorizontal)
export const IconSun = phosphor(Sun)
export const IconMoon = phosphor(Moon)
export const IconSystem = phosphor(Monitor)
export const IconInfo = phosphor(Info)
export const IconChevronDown = phosphor(CaretDown)
export const IconChevronRight = phosphor(CaretRight)
export const IconArrowLeft = phosphor(ArrowLeft)
export const IconSortAsc = phosphor(CaretUp)
export const IconSortDesc = phosphor(CaretDown)
export const IconCheck = phosphor(Check)
export const IconClose = phosphor(X)
export const IconFile = phosphor(FileText)
export const IconTrash = phosphor(Trash)
export const IconAlert = phosphor(Warning)
export const IconLock = phosphor(LockSimple)
export const IconOffline = phosphor(ShieldCheck)
export const IconTrend = phosphor(TrendUp)
