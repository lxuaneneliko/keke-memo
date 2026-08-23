import type { Memo } from './types'

const isoAfter = (days: number, hour = 23, minute = 59) => {
  const value = new Date()
  value.setDate(value.getDate() + days)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

const isoBefore = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

export const DEFAULT_CATEGORIES = ['課業', '生活', '工作']
export const DEFAULT_COURSES = ['微積分', '普通物理', '程式設計']

export function createSeedMemos(): Memo[] {
  return [
    {
      id: crypto.randomUUID(),
      title: '完成程式設計期末報告',
      content: '主題：校園生活工具。記得把使用者測試結果放進最後一頁。',
      category: '課業',
      course: '程式設計',
      tags: ['期末', '小組'],
      color: 'lime',
      isPinned: true,
      isArchived: false,
      isTodo: true,
      isCompleted: false,
      createdAt: isoBefore(280),
      updatedAt: isoBefore(12),
      lastViewedAt: isoBefore(8),
      dueAt: isoAfter(0, 22),
      reminderAt: isoAfter(0, 19),
      repeat: 'none',
      checklist: [
        { id: crypto.randomUUID(), text: '整理訪談資料', completed: true },
        { id: crypto.randomUUID(), text: '完成簡報', completed: false },
        { id: crypto.randomUUID(), text: '練習講稿', completed: false },
      ],
      attachments: [],
      links: [],
    },
    {
      id: crypto.randomUUID(),
      title: '微積分 Ch.6 課堂筆記',
      content: '定積分可以理解成黎曼和的極限。複習：換元積分法、分部積分法。',
      category: '課業',
      course: '微積分',
      tags: ['課堂筆記', '考試'],
      color: 'blue',
      isPinned: false,
      isArchived: false,
      isTodo: false,
      isCompleted: false,
      createdAt: isoBefore(1_680),
      updatedAt: isoBefore(180),
      lastViewedAt: isoBefore(160),
      repeat: 'none',
      checklist: [],
      attachments: [],
      links: [],
    },
    {
      id: crypto.randomUUID(),
      title: '普通物理小考',
      content: '範圍：動量與碰撞、轉動慣量。考前再做一次習題 8-12。',
      category: '課業',
      course: '普通物理',
      tags: ['小考'],
      color: 'coral',
      isPinned: false,
      isArchived: false,
      isTodo: true,
      isCompleted: false,
      createdAt: isoBefore(800),
      updatedAt: isoBefore(420),
      dueAt: isoAfter(2, 9),
      repeat: 'none',
      checklist: [
        { id: crypto.randomUUID(), text: '複習公式', completed: false },
        { id: crypto.randomUUID(), text: '寫習題 8-12', completed: false },
      ],
      attachments: [],
      links: [],
    },
    {
      id: crypto.randomUUID(),
      title: '週末採買清單',
      content: '去圖書館還書後順路買。',
      category: '生活',
      course: '',
      tags: ['採買'],
      color: 'yellow',
      isPinned: false,
      isArchived: false,
      isTodo: true,
      isCompleted: false,
      createdAt: isoBefore(500),
      updatedAt: isoBefore(490),
      repeat: 'none',
      checklist: [
        { id: crypto.randomUUID(), text: '筆記本', completed: false },
        { id: crypto.randomUUID(), text: '咖啡豆', completed: false },
      ],
      attachments: [],
      links: [],
    },
  ]
}
