import type { Memo, QuickDraft } from './types'

const MEMOS_KEY = 'keke-memos-v1'
const DRAFT_KEY = 'keke-quick-draft-v1'

export const EMPTY_DRAFT: QuickDraft = {
  title: '',
  content: '',
  course: '',
  color: 'lime',
}

export function loadMemos(): Memo[] | null {
  try {
    const raw = localStorage.getItem(MEMOS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Memo[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveMemos(memos: Memo[]) {
  localStorage.setItem(MEMOS_KEY, JSON.stringify(memos))
}

export function loadDraft(): QuickDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<QuickDraft>) } : EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

export function saveDraft(draft: QuickDraft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}
