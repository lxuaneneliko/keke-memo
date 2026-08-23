import type { DateFilter, Memo } from './types'

export type DueTone = 'today' | 'soon' | 'overdue' | 'done' | 'later'

export interface DueStatus {
  label: string
  tone: DueTone
  sortOrder: number
}

const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()

export function getDueStatus(
  dueAt?: string,
  completed = false,
  now = new Date(),
): DueStatus | null {
  if (!dueAt) return null
  if (completed) return { label: '已完成', tone: 'done', sortOrder: 4 }

  const due = new Date(dueAt)
  const dayDifference = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000)

  if (dayDifference < 0) {
    return {
      label: `已逾期 ${Math.abs(dayDifference)} 天`,
      tone: 'overdue',
      sortOrder: 0,
    }
  }
  if (dayDifference === 0) return { label: '今天到期', tone: 'today', sortOrder: 1 }
  if (dayDifference <= 3) {
    return { label: `${dayDifference} 天內到期`, tone: 'soon', sortOrder: 2 }
  }
  return {
    label: new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(due),
    tone: 'later',
    sortOrder: 3,
  }
}

export function matchesDateFilter(
  memo: Memo,
  filter: DateFilter,
  now = new Date(),
): boolean {
  if (filter === 'all') return true
  const status = getDueStatus(memo.dueAt, memo.isCompleted, now)
  if (!status) return false
  if (filter === 'today') return status.tone === 'today'
  if (filter === 'threeDays') return status.tone === 'today' || status.tone === 'soon'
  return status.tone === 'overdue'
}

export function formatNoteTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const difference = now.getTime() - date.getTime()
  if (difference < 60_000) return '剛剛'
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} 分鐘前`
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} 小時前`
  return new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric' }).format(date)
}

export function toLocalInputValue(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

export function fromLocalInputValue(value: string): string | undefined {
  if (!value) return undefined
  return new Date(value).toISOString()
}

export function distanceInMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(second.latitude - first.latitude)
  const longitudeDelta = toRadians(second.longitude - first.longitude)
  const firstLatitude = toRadians(first.latitude)
  const secondLatitude = toRadians(second.latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function nextReminder(iso: string, repeat: Memo['repeat']): string | undefined {
  if (repeat === 'none') return undefined
  const next = new Date(iso)
  if (repeat === 'daily') next.setDate(next.getDate() + 1)
  if (repeat === 'weekly') next.setDate(next.getDate() + 7)
  return next.toISOString()
}
