export type MemoColor = 'lime' | 'blue' | 'coral' | 'yellow' | 'lavender'
export type RepeatRule = 'none' | 'daily' | 'weekly'
export type AttachmentKind = 'image' | 'audio' | 'file' | 'drawing'

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
}

export interface Attachment {
  id: string
  kind: AttachmentKind
  name: string
  dataUrl: string
  size: number
}

export interface LocationReminder {
  label: string
  latitude: number
  longitude: number
  radius: number
  enabled: boolean
  lastNotifiedAt?: string
}

export interface Memo {
  id: string
  title: string
  content: string
  category: string
  course: string
  tags: string[]
  color: MemoColor
  isPinned: boolean
  isArchived: boolean
  isTodo: boolean
  isCompleted: boolean
  createdAt: string
  updatedAt: string
  lastViewedAt?: string
  dueAt?: string
  reminderAt?: string
  repeat: RepeatRule
  lastNotifiedAt?: string
  locationReminder?: LocationReminder
  checklist: ChecklistItem[]
  attachments: Attachment[]
  links: string[]
}

export interface QuickDraft {
  title: string
  content: string
  course: string
  color: MemoColor
}

export type AppView = 'today' | 'notes' | 'tasks' | 'recent' | 'archive' | 'settings'
export type DateFilter = 'all' | 'today' | 'threeDays' | 'overdue'
