import {
  Archive,
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CloudUpload,
  File as FileIcon,
  FileDown,
  FileUp,
  Folder,
  GraduationCap,
  Home,
  Image,
  Link2,
  ListChecks,
  MapPin,
  Menu,
  Mic,
  MoreHorizontal,
  Paperclip,
  PencilLine,
  Pin,
  Plus,
  Search,
  Settings,
  Share2,
  Sparkles,
  SquarePen,
  Table2,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications, Weekday } from '@capacitor/local-notifications'
import { SketchPad } from './components/SketchPad'
import { createSeedMemos, DEFAULT_CATEGORIES, DEFAULT_COURSES } from './data'
import { EMPTY_DRAFT, loadDraft, loadMemos, saveDraft, saveMemos } from './storage'
import type {
  AppView,
  Attachment,
  DateFilter,
  Memo,
  MemoColor,
  QuickDraft,
} from './types'
import {
  distanceInMeters,
  formatNoteTime,
  fromLocalInputValue,
  getDueStatus,
  matchesDateFilter,
  nextReminder,
  toLocalInputValue,
} from './utils'

const COLOR_LABELS: Record<MemoColor, string> = {
  lime: '螢光綠',
  blue: '海水藍',
  coral: '珊瑚紅',
  yellow: '筆記黃',
  lavender: '薰衣紫',
}

const VIEW_LABELS: Record<AppView, string> = {
  today: '今天',
  notes: '所有筆記',
  tasks: '待辦清單',
  recent: '最近查看',
  archive: '封存',
  settings: '設定',
}

const notificationIdForMemo = (id: string) => {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }
  return (Math.abs(hash) % 2_000_000_000) + 1
}

const makeMemo = (overrides: Partial<Memo> = {}): Memo => {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    content: '',
    category: '課業',
    course: '',
    tags: [],
    color: 'lime',
    isPinned: false,
    isArchived: false,
    isTodo: false,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
    repeat: 'none',
    checklist: [],
    attachments: [],
    links: [],
    ...overrides,
  }
}

const fileToDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

function App() {
  const [memos, setMemos] = useState<Memo[]>(() => loadMemos() ?? createSeedMemos())
  const [view, setView] = useState<AppView>('today')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [tagFilter, setTagFilter] = useState('全部')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [draft, setDraft] = useState<QuickDraft>(() => loadDraft())
  const [draftSaved, setDraftSaved] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [listening, setListening] = useState(false)
  const [recordingMemoId, setRecordingMemoId] = useState<string | null>(null)
  const [sketchMemoId, setSketchMemoId] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    Capacitor.isNativePlatform()
      ? 'default'
      : 'Notification' in window
        ? Notification.permission
        : 'unsupported',
  )
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const importRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selectedMemo = useMemo(
    () => memos.find((memo) => memo.id === selectedId) ?? null,
    [memos, selectedId],
  )

  const categories = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_CATEGORIES, ...memos.map((memo) => memo.category).filter(Boolean)]),
      ),
    [memos],
  )
  const courses = useMemo(
    () =>
      Array.from(
        new Set([...DEFAULT_COURSES, ...memos.map((memo) => memo.course).filter(Boolean)]),
      ),
    [memos],
  )
  const tags = useMemo(
    () => Array.from(new Set(memos.flatMap((memo) => memo.tags))).sort(),
    [memos],
  )

  useEffect(() => {
    try {
      saveMemos(memos)
    } catch {
      setToast('儲存空間已滿，請匯出備份後移除大型附件')
    }
  }, [memos])

  useEffect(() => {
    setDraftSaved(false)
    const timer = window.setTimeout(() => {
      saveDraft(draft)
      setDraftSaved(true)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [draft])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2_800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let active = true

    void LocalNotifications.createChannel({
      id: 'keke-reminders',
      name: '課刻提醒',
      description: '作業、考試與備忘錄提醒',
      importance: 4,
      visibility: 1,
      vibration: true,
    }).catch(() => undefined)

    void LocalNotifications.checkPermissions().then((status) => {
      if (active) setNotificationPermission(status.display === 'granted' ? 'granted' : 'default')
    })

    const listener = LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (event) => {
        const memoId = event.notification.extra?.memoId
        if (typeof memoId === 'string') setSelectedId(memoId)
      },
    )

    return () => {
      active = false
      void listener.then((handle) => handle.remove())
    }
  }, [])

  const notify = useCallback((title: string, body: string) => {
    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2_000_000_000),
            title,
            body,
            channelId: 'keke-reminders',
            schedule: { at: new Date(Date.now() + 250), allowWhileIdle: true },
          },
        ],
      }).catch(() => undefined)
      return
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icon.svg', tag: title })
    }
  }, [])

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return
    const processReminders = () => {
      const now = Date.now()
      setMemos((current) =>
        current.map((memo) => {
          if (
            !memo.reminderAt ||
            new Date(memo.reminderAt).getTime() > now ||
            memo.lastNotifiedAt === memo.reminderAt
          ) {
            return memo
          }
          notify(`課刻提醒｜${memo.title || '未命名備忘錄'}`, memo.content || '該回來看看囉')
          const following = nextReminder(memo.reminderAt, memo.repeat)
          return {
            ...memo,
            reminderAt: following ?? memo.reminderAt,
            lastNotifiedAt: following ? undefined : memo.reminderAt,
          }
        }),
      )
    }
    processReminders()
    const timer = window.setInterval(processReminders, 30_000)
    return () => window.clearInterval(timer)
  }, [notify])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const timer = window.setTimeout(() => {
      void (async () => {
        const permission = await LocalNotifications.checkPermissions()
        if (permission.display !== 'granted') return

        const pending = await LocalNotifications.getPending()
        if (pending.notifications.length) {
          await LocalNotifications.cancel({
            notifications: pending.notifications.map(({ id }) => ({ id })),
          })
        }

        const notifications = memos.flatMap((memo) => {
          if (!memo.reminderAt || memo.isCompleted || memo.isArchived) return []
          const reminderDate = new Date(memo.reminderAt)
          if (memo.repeat === 'none' && reminderDate.getTime() <= Date.now()) return []

          const schedule =
            memo.repeat === 'daily'
              ? {
                  on: {
                    hour: reminderDate.getHours(),
                    minute: reminderDate.getMinutes(),
                  },
                  allowWhileIdle: true,
                }
              : memo.repeat === 'weekly'
                ? {
                    on: {
                      weekday: (reminderDate.getDay() + 1) as Weekday,
                      hour: reminderDate.getHours(),
                      minute: reminderDate.getMinutes(),
                    },
                    allowWhileIdle: true,
                  }
                : { at: reminderDate, allowWhileIdle: true }

          return [
            {
              id: notificationIdForMemo(memo.id),
              title: `課刻提醒｜${memo.title || '未命名備忘錄'}`,
              body: memo.content || '該回來看看囉',
              channelId: 'keke-reminders',
              schedule,
              extra: { memoId: memo.id },
            },
          ]
        })

        if (notifications.length) {
          await LocalNotifications.schedule({ notifications })
        }
      })().catch(() => setToast('原生提醒排程失敗，請重新開啟通知權限'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [memos])

  const locationSignature = memos
    .filter((memo) => memo.locationReminder?.enabled)
    .map((memo) => `${memo.id}:${memo.locationReminder?.latitude}:${memo.locationReminder?.longitude}`)
    .join('|')

  useEffect(() => {
    if (!locationSignature || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const currentPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }
        setMemos((current) =>
          current.map((memo) => {
            const location = memo.locationReminder
            if (!location?.enabled) return memo
            const recentlyNotified =
              location.lastNotifiedAt &&
              Date.now() - new Date(location.lastNotifiedAt).getTime() < 10 * 60 * 60 * 1_000
            if (
              recentlyNotified ||
              distanceInMeters(currentPosition, location) > location.radius
            ) {
              return memo
            }
            notify(
              `已到${location.label}｜${memo.title || '地點提醒'}`,
              memo.content || '別忘了這件事',
            )
            return {
              ...memo,
              locationReminder: { ...location, lastNotifiedAt: new Date().toISOString() },
            }
          }),
        )
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [locationSignature, notify])

  const updateMemo = useCallback(
    (id: string, change: Partial<Memo> | ((memo: Memo) => Partial<Memo>)) => {
      setMemos((current) =>
        current.map((memo) => {
          if (memo.id !== id) return memo
          const patch = typeof change === 'function' ? change(memo) : change
          return { ...memo, ...patch, updatedAt: new Date().toISOString() }
        }),
      )
    },
    [],
  )

  const openMemo = (id: string) => {
    setSelectedId(id)
    setSidebarOpen(false)
    updateMemo(id, { lastViewedAt: new Date().toISOString() })
  }

  const createQuickMemo = () => {
    if (!draft.title.trim() && !draft.content.trim()) {
      setToast('先寫下一句，再按加入')
      return
    }
    const inferredTitle = draft.content.trim().split('\n')[0].slice(0, 28)
    const memo = makeMemo({
      title: draft.title.trim() || inferredTitle || '快速筆記',
      content: draft.content.trim(),
      category: draft.course ? '課業' : '生活',
      course: draft.course,
      color: draft.color,
    })
    setMemos((current) => [memo, ...current])
    setDraft(EMPTY_DRAFT)
    setToast('已加入，而且已自動儲存')
  }

  const createBlankMemo = () => {
    const memo = makeMemo()
    setMemos((current) => [memo, ...current])
    setSelectedId(memo.id)
  }

  const createTodoMemo = () => {
    const memo = makeMemo({
      category: '課業',
      color: 'blue',
      isTodo: true,
    })
    setMemos((current) => [memo, ...current])
    setSelectedId(memo.id)
  }

  const startSpeech = (onTranscript: (text: string) => void) => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string
        interimResults: boolean
        continuous: boolean
        start: () => void
        stop: () => void
        onresult: (event: {
          results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
        }) => void
        onend: () => void
        onerror: () => void
      }
      webkitSpeechRecognition?: new () => {
        lang: string
        interimResults: boolean
        continuous: boolean
        start: () => void
        stop: () => void
        onresult: (event: {
          results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
        }) => void
        onend: () => void
        onerror: () => void
      }
    }
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setToast('這個瀏覽器尚未支援語音轉文字')
      return
    }
    const recognition = new Recognition()
    recognition.lang = 'zh-TW'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join('')
      if (text) onTranscript(text)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => {
      setListening(false)
      setToast('沒有聽清楚，再試一次')
    }
    setListening(true)
    recognition.start()
  }

  const addFiles = async (memoId: string, files: FileList | null, kind?: Attachment['kind']) => {
    if (!files?.length) return
    const accepted = Array.from(files).filter((file) => {
      if (file.size <= 3_000_000) return true
      setToast(`${file.name} 超過 3 MB，未加入`)
      return false
    })
    const attachments = await Promise.all(
      accepted.map(async (file): Promise<Attachment> => {
        const attachmentKind =
          kind ?? (file.type.startsWith('image/') ? 'image' : ('file' as Attachment['kind']))
        return {
          id: crypto.randomUUID(),
          kind: attachmentKind,
          name: file.name,
          dataUrl: await fileToDataUrl(file),
          size: file.size,
        }
      }),
    )
    updateMemo(memoId, (memo) => ({ attachments: [...memo.attachments, ...attachments] }))
    if (attachments.length) setToast(`已加入 ${attachments.length} 個附件`)
  }

  const toggleAudioRecording = async (memoId: string) => {
    if (recordingMemoId) {
      mediaRecorderRef.current?.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !('MediaRecorder' in window)) {
      setToast('這個裝置尚未支援錄音')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data)
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const attachment: Attachment = {
          id: crypto.randomUUID(),
          kind: 'audio',
          name: `錄音-${new Date().toLocaleTimeString('zh-TW', {
            hour: '2-digit',
            minute: '2-digit',
          })}.webm`,
          dataUrl: await fileToDataUrl(blob),
          size: blob.size,
        }
        updateMemo(memoId, (memo) => ({ attachments: [...memo.attachments, attachment] }))
        stream.getTracks().forEach((track) => track.stop())
        setRecordingMemoId(null)
        setToast('錄音已加入筆記')
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingMemoId(memoId)
    } catch {
      setToast('需要麥克風權限才能錄音')
    }
  }

  const requestNotifications = async () => {
    if (Capacitor.isNativePlatform()) {
      const permission = await LocalNotifications.requestPermissions()
      const granted = permission.display === 'granted'
      setNotificationPermission(granted ? 'granted' : 'denied')
      setToast(granted ? '通知已開啟' : '通知尚未開啟')
      return
    }
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported')
      setToast('這個瀏覽器不支援通知')
      return
    }
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    setToast(permission === 'granted' ? '通知已開啟' : '通知尚未開啟')
  }

  const filteredMemos = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('zh-TW')
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    let result = memos.filter((memo) => {
      if (view === 'archive') return memo.isArchived
      if (memo.isArchived) return false
      if (view === 'tasks') return memo.isTodo
      if (view === 'recent') return Boolean(memo.lastViewedAt)
      if (view === 'today') {
        const status = getDueStatus(memo.dueAt, memo.isCompleted)
        const touchedToday = new Date(memo.updatedAt).getTime() >= todayStart.getTime()
        return (
          memo.isPinned ||
          touchedToday ||
          status?.tone === 'today' ||
          status?.tone === 'soon' ||
          status?.tone === 'overdue'
        )
      }
      return true
    })

    if (normalizedQuery) {
      result = result.filter((memo) =>
        [
          memo.title,
          memo.content,
          memo.category,
          memo.course,
          memo.tags.join(' '),
          memo.checklist.map((item) => item.text).join(' '),
        ]
          .join(' ')
          .toLocaleLowerCase('zh-TW')
          .includes(normalizedQuery),
      )
    }
    if (categoryFilter !== '全部') {
      result = result.filter(
        (memo) => memo.category === categoryFilter || memo.course === categoryFilter,
      )
    }
    if (tagFilter !== '全部') result = result.filter((memo) => memo.tags.includes(tagFilter))
    result = result.filter((memo) => matchesDateFilter(memo, dateFilter))

    return result.sort((first, second) => {
      if (view === 'recent') {
        return (
          new Date(second.lastViewedAt ?? 0).getTime() -
          new Date(first.lastViewedAt ?? 0).getTime()
        )
      }
      if (first.isPinned !== second.isPinned) return first.isPinned ? -1 : 1
      const firstDue = getDueStatus(first.dueAt, first.isCompleted)?.sortOrder ?? 10
      const secondDue = getDueStatus(second.dueAt, second.isCompleted)?.sortOrder ?? 10
      if (firstDue !== secondDue) return firstDue - secondDue
      return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
    })
  }, [categoryFilter, dateFilter, memos, query, tagFilter, view])

  const taskStats = useMemo(() => {
    const active = memos.filter((memo) => memo.isTodo && !memo.isArchived)
    return {
      open: active.filter((memo) => !memo.isCompleted).length,
      done: active.filter((memo) => memo.isCompleted).length,
      urgent: active.filter((memo) => {
        const tone = getDueStatus(memo.dueAt, memo.isCompleted)?.tone
        return tone === 'today' || tone === 'overdue'
      }).length,
    }
  }, [memos])

  const todayTodos = useMemo(
    () =>
      memos
        .filter((memo) => memo.isTodo && !memo.isCompleted && !memo.isArchived)
        .sort((first, second) => {
          if (first.isPinned !== second.isPinned) return first.isPinned ? -1 : 1
          const firstDue = getDueStatus(first.dueAt)?.sortOrder ?? 10
          const secondDue = getDueStatus(second.dueAt)?.sortOrder ?? 10
          if (firstDue !== secondDue) return firstDue - secondDue
          return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
        }),
    [memos],
  )

  const displayedMemos = useMemo(
    () => (view === 'today' ? filteredMemos.filter((memo) => !memo.isTodo) : filteredMemos),
    [filteredMemos, view],
  )

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date(), memos }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `課刻備份-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setToast('備份檔已下載')
  }

  const shareBackup = async () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date(), memos }, null, 2)], {
      type: 'application/json',
    })
    const file = new File([blob], `課刻備份-${new Date().toISOString().slice(0, 10)}.json`, {
      type: 'application/json',
    })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: '課刻備份', files: [file] })
    } else {
      exportData()
    }
  }

  const importData = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as { memos?: Memo[] } | Memo[]
      const imported = Array.isArray(parsed) ? parsed : parsed.memos
      if (!Array.isArray(imported)) throw new Error('Invalid backup')
      setMemos(imported)
      setToast(`已匯入 ${imported.length} 則備忘錄`)
    } catch {
      setToast('這不是可用的課刻備份檔')
    }
  }

  const shareMemo = async (memo: Memo) => {
    const checklistText = memo.checklist
      .map((item) => `${item.completed ? '✓' : '□'} ${item.text}`)
      .join('\n')
    const text = [memo.content, checklistText, memo.links.join('\n')].filter(Boolean).join('\n\n')
    if (navigator.share) {
      await navigator.share({ title: memo.title || '課刻筆記', text })
    } else {
      await navigator.clipboard.writeText(`${memo.title}\n\n${text}`)
      setToast('內容已複製')
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">課</div>
          <div>
            <strong>課刻</strong>
            <span>KEKE MEMO</span>
          </div>
          <button
            className="icon-button sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="關閉選單"
          >
            <X size={20} />
          </button>
        </div>

        <button className="new-note-button" onClick={createBlankMemo}>
          <SquarePen size={19} />
          新增備忘錄
          <span>＋</span>
        </button>

        <nav className="main-nav" aria-label="主要導覽">
          {(
            [
              ['today', Home, '今天'],
              ['notes', BookOpen, '所有筆記'],
              ['tasks', ListChecks, '待辦清單'],
              ['recent', Clock3, '最近查看'],
              ['archive', Archive, '封存'],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              className={view === key ? 'active' : ''}
              onClick={() => {
                setView(key)
                setSidebarOpen(false)
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {key === 'tasks' && taskStats.open > 0 && <b>{taskStats.open}</b>}
            </button>
          ))}
        </nav>

        <div className="nav-section">
          <div className="nav-heading">
            <span>資料夾</span>
            <button aria-label="新增資料夾" onClick={() => setToast('可在筆記內直接輸入新分類')}>
              <Plus size={15} />
            </button>
          </div>
          <button
            className={categoryFilter === '全部' ? 'folder-link active' : 'folder-link'}
            onClick={() => setCategoryFilter('全部')}
          >
            <span className="folder-dot all" />
            全部
            <em>{memos.filter((memo) => !memo.isArchived).length}</em>
          </button>
          {categories.map((category, index) => (
            <button
              key={category}
              className={categoryFilter === category ? 'folder-link active' : 'folder-link'}
              onClick={() => {
                setCategoryFilter(category)
                setView('notes')
              }}
            >
              <span className={`folder-dot dot-${index % 4}`} />
              {category}
              <em>{memos.filter((memo) => memo.category === category && !memo.isArchived).length}</em>
            </button>
          ))}
        </div>

        <button
          className={`settings-link ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
        >
          <Settings size={18} />
          設定與備份
        </button>
        <div className="storage-note">
          <CloudUpload size={16} />
          <div>
            <span>離線儲存中</span>
            <small>{memos.length} 則內容都在這台裝置</small>
          </div>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)}>
            <Menu size={21} />
          </button>
          <div className="mobile-brand">
            <span>課</span>
            <strong>課刻</strong>
          </div>
          <div className={`search-box ${mobileSearchOpen ? 'mobile-open' : ''}`}>
            <button
              className="search-trigger"
              onClick={() => {
                setMobileSearchOpen(true)
                window.setTimeout(() => searchInputRef.current?.focus(), 0)
              }}
              aria-label="搜尋備忘錄"
            >
              <Search size={18} />
            </button>
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋標題、內容、標籤..."
              aria-label="搜尋標題、內容、標籤"
            />
            <kbd>⌘ K</kbd>
            <button
              className="search-close"
              onClick={() => setMobileSearchOpen(false)}
              aria-label="關閉搜尋"
            >
              <X size={17} />
            </button>
          </div>
          <button
            className={`filter-toggle ${filtersOpen ? 'active' : ''}`}
            onClick={() => setFiltersOpen((current) => !current)}
            aria-label="篩選"
          >
            <Tag size={17} />
            <span>篩選</span>
            <ChevronDown size={15} />
          </button>
          <button className="notification-button" onClick={requestNotifications}>
            {notificationPermission === 'granted' ? <BellRing size={19} /> : <Bell size={19} />}
            <span className={notificationPermission === 'granted' ? 'status-on' : ''} />
          </button>
          <div className="avatar">你</div>
        </header>

        {filtersOpen && (
          <section className="filter-bar" aria-label="篩選條件">
            <label>
              分類
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option>全部</option>
                {[...categories, ...courses].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              標籤
              <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option>全部</option>
                {tags.map((tag) => (
                  <option key={tag}>{tag}</option>
                ))}
              </select>
            </label>
            <label>
              日期
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
              >
                <option value="all">不限日期</option>
                <option value="today">今天到期</option>
                <option value="threeDays">三天內到期</option>
                <option value="overdue">已逾期</option>
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => {
                setCategoryFilter('全部')
                setTagFilter('全部')
                setDateFilter('all')
                setQuery('')
              }}
            >
              清除條件
            </button>
          </section>
        )}

        <div className="content-scroll">
          {view === 'settings' ? (
            <SettingsPage
              memos={memos}
              permission={notificationPermission}
              onRequestNotifications={requestNotifications}
              onExport={exportData}
              onShareBackup={shareBackup}
              onImport={() => importRef.current?.click()}
            />
          ) : (
            <>
              <section className="page-heading">
                <div>
                  <span className="eyebrow">
                    {new Intl.DateTimeFormat('zh-TW', {
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long',
                    }).format(new Date())}
                  </span>
                  <h1>{view === 'today' ? '目前待辦' : VIEW_LABELS[view]}</h1>
                  <p>
                    {view === 'today'
                      ? taskStats.open
                        ? `先完成一件，今天就會輕一點。${taskStats.urgent} 件需要優先處理。`
                        : '今天沒有未完成事項，可以放心安排自己的時間。'
                      : `目前顯示 ${filteredMemos.length} 則內容`}
                  </p>
                </div>
                {view === 'today' && (
                  <div className="focus-stats">
                    <div>
                      <strong>{taskStats.open}</strong>
                      <span>未完成</span>
                    </div>
                    <div>
                      <strong>{taskStats.done}</strong>
                      <span>已完成</span>
                    </div>
                  </div>
                )}
              </section>

              {view === 'today' && (
                <>
                  <TodayTodoBoard
                    todos={todayTodos}
                    onNew={createTodoMemo}
                    onOpen={openMemo}
                    onToggleComplete={(memo) =>
                      updateMemo(memo.id, { isCompleted: true, isTodo: true })
                    }
                  />
                  <QuickCapture
                    draft={draft}
                    courses={courses}
                    listening={listening}
                    saved={draftSaved}
                    onChange={setDraft}
                    onAdd={createQuickMemo}
                    onVoice={() =>
                      startSpeech((text) =>
                        setDraft((current) => ({
                          ...current,
                          content: `${current.content}${current.content ? ' ' : ''}${text}`,
                        })),
                      )
                    }
                  />
                </>
              )}

              {view === 'tasks' && (
                <section className="task-overview">
                  <div className="task-progress">
                    <div
                      className="progress-ring"
                      style={
                        {
                          '--progress': `${
                            taskStats.open + taskStats.done
                              ? (taskStats.done / (taskStats.open + taskStats.done)) * 360
                              : 0
                          }deg`,
                        } as React.CSSProperties
                      }
                    >
                      <span>
                        {taskStats.open + taskStats.done
                          ? Math.round(
                              (taskStats.done / (taskStats.open + taskStats.done)) * 100,
                            )
                          : 0}
                        %
                      </span>
                    </div>
                    <div>
                      <span className="eyebrow">THIS WEEK</span>
                      <h2>一步一步，也是在前進</h2>
                      <p>完成 {taskStats.done} 件，還有 {taskStats.open} 件。</p>
                    </div>
                  </div>
                  <button onClick={createBlankMemo}>
                    <Plus size={18} /> 新增待辦
                  </button>
                </section>
              )}

              <section className="notes-section">
                <div className="section-title">
                  <div>
                    <h2>{view === 'today' ? '最近筆記' : VIEW_LABELS[view]}</h2>
                    {(query ||
                      categoryFilter !== '全部' ||
                      tagFilter !== '全部' ||
                      dateFilter !== 'all') && (
                      <span>{displayedMemos.length} 個搜尋結果</span>
                    )}
                  </div>
                  <button onClick={createBlankMemo}>
                    <Plus size={17} />
                    新增
                  </button>
                </div>

                {displayedMemos.length ? (
                  <div className="notes-grid">
                    {displayedMemos.map((memo, index) => (
                      <MemoCard
                        key={memo.id}
                        memo={memo}
                        index={index}
                        onOpen={() => openMemo(memo.id)}
                        onTogglePin={() => updateMemo(memo.id, { isPinned: !memo.isPinned })}
                        onToggleComplete={() =>
                          updateMemo(memo.id, {
                            isTodo: true,
                            isCompleted: !memo.isCompleted,
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div>
                      <Sparkles size={30} />
                    </div>
                    <h3>這一頁很安靜</h3>
                    <p>換個篩選條件，或新增第一則筆記。</p>
                    <button className="primary-button" onClick={createBlankMemo}>
                      <Plus size={18} /> 新增備忘錄
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      {selectedMemo && (
        <MemoEditor
          memo={selectedMemo}
          categories={categories}
          courses={courses}
          recording={recordingMemoId === selectedMemo.id}
          listening={listening}
          onClose={() => setSelectedId(null)}
          onChange={(change) => updateMemo(selectedMemo.id, change)}
          onDelete={() => {
            if (!window.confirm('確定要刪除這則備忘錄嗎？此動作無法復原。')) return
            setMemos((current) => current.filter((memo) => memo.id !== selectedMemo.id))
            setSelectedId(null)
            setToast('備忘錄已刪除')
          }}
          onVoice={() =>
            startSpeech((text) =>
              updateMemo(selectedMemo.id, (memo) => ({
                content: `${memo.content}${memo.content ? ' ' : ''}${text}`,
              })),
            )
          }
          onFiles={(files, kind) => addFiles(selectedMemo.id, files, kind)}
          onRecord={() => toggleAudioRecording(selectedMemo.id)}
          onSketch={() => setSketchMemoId(selectedMemo.id)}
          onShare={() => shareMemo(selectedMemo)}
          onUseLocation={() => {
            if (!navigator.geolocation) {
              setToast('這個裝置不支援定位')
              return
            }
            navigator.geolocation.getCurrentPosition(
              (position) => {
                updateMemo(selectedMemo.id, {
                  locationReminder: {
                    label: selectedMemo.locationReminder?.label || '指定地點',
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    radius: selectedMemo.locationReminder?.radius || 200,
                    enabled: true,
                  },
                })
                setToast('已記錄目前位置')
              },
              () => setToast('需要定位權限才能設定地點提醒'),
            )
          }}
        />
      )}

      {sketchMemoId && (
        <SketchPad
          onClose={() => setSketchMemoId(null)}
          onSave={(dataUrl) => {
            const attachment: Attachment = {
              id: crypto.randomUUID(),
              kind: 'drawing',
              name: `手寫-${new Date().toLocaleDateString('zh-TW')}.png`,
              dataUrl,
              size: dataUrl.length,
            }
            updateMemo(sketchMemoId, (memo) => ({
              attachments: [...memo.attachments, attachment],
            }))
            setSketchMemoId(null)
            setToast('手寫內容已加入')
          }}
        />
      )}

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void importData(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      <button className="mobile-fab" onClick={createBlankMemo} aria-label="新增備忘錄">
        <Plus size={25} />
      </button>

      <nav className="bottom-nav" aria-label="手機導覽">
        {(
          [
            ['today', Home, '今天'],
            ['notes', BookOpen, '筆記'],
            ['tasks', CheckCircle2, '待辦'],
            ['settings', Settings, '設定'],
          ] as const
        ).map(([key, Icon, label]) => (
          <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  )
}

interface TodayTodoBoardProps {
  todos: Memo[]
  onNew: () => void
  onOpen: (id: string) => void
  onToggleComplete: (memo: Memo) => void
}

function TodayTodoBoard({ todos, onNew, onOpen, onToggleComplete }: TodayTodoBoardProps) {
  return (
    <section className="today-todo-board" aria-label="目前待辦">
      <header className="todo-board-header">
        <div className="todo-brand-row">
          <div className="todo-brand-mark">
            <CheckCircle2 size={23} />
          </div>
          <div>
            <span className="eyebrow">TODAY'S QUEUE</span>
            <h2>目前待辦</h2>
          </div>
        </div>
        <div className="todo-count-pill">
          <span className="live-dot" />
          {todos.length} 件未完成
        </div>
      </header>

      <div className={`todo-ticket-reel ${todos.length === 0 ? 'empty' : ''}`}>
        <div className="todo-machine-rail left" />
        <div className="todo-machine-rail right" />
        {todos.length ? (
          <div className="todo-ticket-list">
            {todos.map((memo, index) => {
              const due = getDueStatus(memo.dueAt, memo.isCompleted)
              return (
                <article
                  key={memo.id}
                  className={`todo-ticket ticket-${memo.color}`}
                  style={{ '--ticket-delay': `${Math.min(index, 8) * 55}ms` } as React.CSSProperties}
                  tabIndex={0}
                  onClick={() => onOpen(memo.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onOpen(memo.id)
                  }}
                >
                  <span className="todo-ticket-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <button
                    className="todo-ticket-check"
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleComplete(memo)
                    }}
                    aria-label={`完成 ${memo.title || '未命名待辦'}`}
                  >
                    <Check size={16} />
                  </button>
                  <div className="todo-ticket-copy">
                    <strong>{memo.title || '未命名待辦'}</strong>
                    <span>
                      {memo.course || memo.category}
                      {memo.checklist.length > 0 &&
                        ` · ${memo.checklist.filter((item) => item.completed).length}/${memo.checklist.length} 子任務`}
                    </span>
                  </div>
                  {due ? (
                    <span className={`todo-ticket-due ${due.tone}`}>
                      <CalendarDays size={14} /> {due.label}
                    </span>
                  ) : (
                    <span className="todo-ticket-edit">點一下編輯</span>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="todo-board-empty">
            <div><Check size={28} /></div>
            <strong>待辦全部清空</strong>
            <span>做得很好，下一件事等想到再加。</span>
          </div>
        )}
      </div>

      <footer className="todo-board-footer">
        <div>
          <Sparkles size={17} />
          點彩色票券可看內容，按方框直接完成
        </div>
        <button onClick={onNew}>
          <Plus size={21} /> 新增待辦
        </button>
      </footer>
    </section>
  )
}

interface QuickCaptureProps {
  draft: QuickDraft
  courses: string[]
  listening: boolean
  saved: boolean
  onChange: React.Dispatch<React.SetStateAction<QuickDraft>>
  onAdd: () => void
  onVoice: () => void
}

function QuickCapture({
  draft,
  courses,
  listening,
  saved,
  onChange,
  onAdd,
  onVoice,
}: QuickCaptureProps) {
  return (
    <section className="quick-capture">
      <div className="tape-label">QUICK CAPTURE</div>
      <div className="quick-icon">
        <PencilLine size={22} />
      </div>
      <div className="quick-fields">
        <input
          className="quick-title"
          value={draft.title}
          onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
          placeholder="標題（也可以先不寫）"
          aria-label="快速筆記標題"
        />
        <textarea
          value={draft.content}
          onChange={(event) => onChange((current) => ({ ...current, content: event.target.value }))}
          placeholder="腦中那句話，先放這裡…"
          aria-label="快速筆記內容"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onAdd()
          }}
        />
        <div className="quick-meta">
          <label>
            <GraduationCap size={15} />
            <select
              value={draft.course}
              onChange={(event) =>
                onChange((current) => ({ ...current, course: event.target.value }))
              }
            >
              <option value="">一般筆記</option>
              {courses.map((course) => (
                <option key={course}>{course}</option>
              ))}
            </select>
          </label>
          <div className="color-picker compact">
            {(Object.keys(COLOR_LABELS) as MemoColor[]).map((color) => (
              <button
                key={color}
                className={`color-dot ${color} ${draft.color === color ? 'active' : ''}`}
                onClick={() => onChange((current) => ({ ...current, color }))}
                aria-label={COLOR_LABELS[color]}
              />
            ))}
          </div>
          <span className="autosave-state">
            {saved ? <Check size={13} /> : <span className="saving-dot" />}
            {saved ? '草稿已儲存' : '儲存中'}
          </span>
        </div>
      </div>
      <div className="quick-actions">
        <button
          className={`voice-button ${listening ? 'listening' : ''}`}
          onClick={onVoice}
          aria-label="語音輸入"
        >
          <Mic size={19} />
          <span>{listening ? '聆聽中' : '用說的'}</span>
        </button>
        <button className="add-capture" onClick={onAdd}>
          <Plus size={20} />
          放進筆記
        </button>
      </div>
    </section>
  )
}

interface MemoCardProps {
  memo: Memo
  index: number
  onOpen: () => void
  onTogglePin: () => void
  onToggleComplete: () => void
}

function MemoCard({ memo, index, onOpen, onTogglePin, onToggleComplete }: MemoCardProps) {
  const due = getDueStatus(memo.dueAt, memo.isCompleted)
  const completedItems = memo.checklist.filter((item) => item.completed).length
  const progress = memo.checklist.length
    ? Math.round((completedItems / memo.checklist.length) * 100)
    : 0

  return (
    <article
      className={`memo-card color-${memo.color} ${memo.isCompleted ? 'completed' : ''}`}
      style={{ '--delay': `${Math.min(index, 8) * 55}ms` } as React.CSSProperties}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen()
      }}
    >
      <div className="card-topline">
        <div className="memo-folder">
          {memo.course ? <GraduationCap size={14} /> : <Folder size={14} />}
          {memo.course || memo.category}
        </div>
        <div className="card-actions">
          <button
            className={memo.isPinned ? 'pinned' : ''}
            onClick={(event) => {
              event.stopPropagation()
              onTogglePin()
            }}
            aria-label={memo.isPinned ? '取消置頂' : '置頂'}
          >
            <Pin size={15} />
          </button>
          <button aria-label="更多">
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>
      <h3>{memo.title || '未命名備忘錄'}</h3>
      {memo.content && <p>{memo.content}</p>}
      {memo.checklist.length > 0 && (
        <div className="mini-checklist">
          {memo.checklist.slice(0, 3).map((item) => (
            <div key={item.id} className={item.completed ? 'done' : ''}>
              <span>{item.completed ? <Check size={11} /> : null}</span>
              {item.text || '未命名項目'}
            </div>
          ))}
          {memo.checklist.length > 3 && <small>＋{memo.checklist.length - 3} 項</small>}
        </div>
      )}
      {memo.checklist.length > 0 && (
        <div className="card-progress" aria-label={`完成 ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="tag-row">
        {memo.tags.slice(0, 3).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <footer>
        <div className="card-signals">
          {memo.attachments.length > 0 && (
            <span>
              <Paperclip size={13} /> {memo.attachments.length}
            </span>
          )}
          {memo.reminderAt && <Bell size={13} />}
          {memo.locationReminder?.enabled && <MapPin size={13} />}
        </div>
        {due ? (
          <button
            className={`due-chip ${due.tone}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggleComplete()
            }}
          >
            {memo.isCompleted ? <CheckCircle2 size={13} /> : <CalendarDays size={13} />}
            {due.label}
          </button>
        ) : (
          <time>{formatNoteTime(memo.updatedAt)}</time>
        )}
      </footer>
    </article>
  )
}

interface MemoEditorProps {
  memo: Memo
  categories: string[]
  courses: string[]
  recording: boolean
  listening: boolean
  onClose: () => void
  onChange: (change: Partial<Memo> | ((memo: Memo) => Partial<Memo>)) => void
  onDelete: () => void
  onVoice: () => void
  onFiles: (files: FileList | null, kind?: Attachment['kind']) => void
  onRecord: () => void
  onSketch: () => void
  onShare: () => void
  onUseLocation: () => void
}

function MemoEditor({
  memo,
  categories,
  courses,
  recording,
  listening,
  onClose,
  onChange,
  onDelete,
  onVoice,
  onFiles,
  onRecord,
  onSketch,
  onShare,
  onUseLocation,
}: MemoEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const due = getDueStatus(memo.dueAt, memo.isCompleted)

  const addChecklistItem = () =>
    onChange((current) => ({
      isTodo: true,
      checklist: [
        ...current.checklist,
        { id: crypto.randomUUID(), text: '', completed: false },
      ],
    }))

  return (
    <>
      <button className="editor-scrim" onClick={onClose} aria-label="關閉編輯器" />
      <aside className="memo-editor" aria-label="編輯備忘錄">
        <header className="editor-header">
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X size={20} />
          </button>
          <div className="editor-save-state">
            <span />
            已自動儲存
          </div>
          <button
            className={`editor-pin ${memo.isPinned ? 'active' : ''}`}
            onClick={() => onChange({ isPinned: !memo.isPinned })}
          >
            <Pin size={17} />
            {memo.isPinned ? '已置頂' : '置頂'}
          </button>
          <button className="icon-button" onClick={onShare} aria-label="分享">
            <Share2 size={18} />
          </button>
        </header>

        <div className="editor-scroll">
          <div className={`editor-color-band color-${memo.color}`} />
          <div className="editor-meta-row">
            <label>
              <Folder size={15} />
              <input
                value={memo.category}
                onChange={(event) => onChange({ category: event.target.value })}
                list="category-options"
                aria-label="分類"
              />
              <datalist id="category-options">
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </datalist>
            </label>
            <label>
              <GraduationCap size={15} />
              <input
                value={memo.course}
                onChange={(event) => onChange({ course: event.target.value })}
                list="course-options"
                placeholder="選擇課程"
                aria-label="課程"
              />
              <datalist id="course-options">
                {courses.map((course) => (
                  <option key={course}>{course}</option>
                ))}
              </datalist>
            </label>
          </div>

          <input
            className="editor-title"
            value={memo.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="這則筆記是關於…"
          />
          <div className="editor-date">
            建立於{' '}
            {new Intl.DateTimeFormat('zh-TW', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(memo.createdAt))}
          </div>

          <div className="editor-toolbar" aria-label="加入內容">
            <button onClick={() => imageInputRef.current?.click()} title="加入圖片">
              <Image size={18} />
              <span>圖片</span>
            </button>
            <button onClick={() => cameraInputRef.current?.click()} title="拍照掃描">
              <Camera size={18} />
              <span>拍照</span>
            </button>
            <button className={listening ? 'active' : ''} onClick={onVoice} title="語音輸入">
              <Mic size={18} />
              <span>口述</span>
            </button>
            <button className={recording ? 'recording' : ''} onClick={onRecord} title="錄音">
              <span className="record-dot" />
              <span>{recording ? '停止' : '錄音'}</span>
            </button>
            <button onClick={onSketch} title="手寫與畫圖">
              <PencilLine size={18} />
              <span>手寫</span>
            </button>
            <button onClick={() => fileInputRef.current?.click()} title="加入檔案">
              <Paperclip size={18} />
              <span>檔案</span>
            </button>
            <button
              onClick={() => {
                const url = window.prompt('貼上網址')
                if (!url) return
                try {
                  const normalized = new URL(url.startsWith('http') ? url : `https://${url}`).href
                  onChange((current) => ({ links: [...current.links, normalized] }))
                } catch {
                  window.alert('網址格式不正確')
                }
              }}
              title="加入網址"
            >
              <Link2 size={18} />
              <span>連結</span>
            </button>
            <button
              onClick={() =>
                onChange((current) => ({
                  content: `${current.content}${current.content ? '\n\n' : ''}| 欄位一 | 欄位二 |\n| --- | --- |\n| 內容 | 內容 |`,
                }))
              }
              title="插入表格"
            >
              <Table2 size={18} />
              <span>表格</span>
            </button>
          </div>

          <textarea
            className="editor-content"
            value={memo.content}
            onChange={(event) => onChange({ content: event.target.value })}
            placeholder="開始記錄內容。你也可以口述、拍照或加入附件…"
          />

          {memo.links.length > 0 && (
            <div className="link-list">
              {memo.links.map((link) => (
                <div key={link}>
                  <Link2 size={15} />
                  <a href={link} target="_blank" rel="noreferrer">
                    {link}
                  </a>
                  <button
                    onClick={() =>
                      onChange((current) => ({
                        links: current.links.filter((item) => item !== link),
                      }))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {memo.attachments.length > 0 && (
            <section className="attachment-section">
              <div className="editor-section-heading">
                <h3>附件</h3>
                <span>{memo.attachments.length} 個</span>
              </div>
              <div className="attachment-grid">
                {memo.attachments.map((attachment) => (
                  <div className="attachment-item" key={attachment.id}>
                    {attachment.kind === 'image' || attachment.kind === 'drawing' ? (
                      <img src={attachment.dataUrl} alt={attachment.name} />
                    ) : attachment.kind === 'audio' ? (
                      <div className="audio-attachment">
                        <Mic size={19} />
                        <audio controls src={attachment.dataUrl} />
                      </div>
                    ) : (
                      <a href={attachment.dataUrl} download={attachment.name}>
                        <FileIcon size={24} />
                        <span>{attachment.name}</span>
                      </a>
                    )}
                    <button
                      className="remove-attachment"
                      onClick={() =>
                        onChange((current) => ({
                          attachments: current.attachments.filter(
                            (item) => item.id !== attachment.id,
                          ),
                        }))
                      }
                      aria-label={`移除 ${attachment.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="checklist-section">
            <div className="editor-section-heading">
              <div>
                <h3>待辦與子任務</h3>
                {memo.checklist.length > 0 && (
                  <span>
                    {memo.checklist.filter((item) => item.completed).length}/
                    {memo.checklist.length} 已完成
                  </span>
                )}
              </div>
              <button onClick={addChecklistItem}>
                <Plus size={16} /> 子任務
              </button>
            </div>
            {memo.checklist.map((item) => (
              <div className={`checklist-row ${item.completed ? 'done' : ''}`} key={item.id}>
                <button
                  onClick={() =>
                    onChange((current) => ({
                      isTodo: true,
                      checklist: current.checklist.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, completed: !entry.completed }
                          : entry,
                      ),
                    }))
                  }
                  aria-label={item.completed ? '標記未完成' : '標記完成'}
                >
                  {item.completed && <Check size={14} />}
                </button>
                <input
                  value={item.text}
                  onChange={(event) =>
                    onChange((current) => ({
                      isTodo: true,
                      checklist: current.checklist.map((entry) =>
                        entry.id === item.id ? { ...entry, text: event.target.value } : entry,
                      ),
                    }))
                  }
                  placeholder="新增子任務…"
                  autoFocus={!item.text}
                />
                <button
                  className="remove-row"
                  onClick={() =>
                    onChange((current) => ({
                      checklist: current.checklist.filter((entry) => entry.id !== item.id),
                    }))
                  }
                  aria-label="刪除子任務"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            {!memo.checklist.length && (
              <button className="empty-checklist" onClick={addChecklistItem}>
                <ListChecks size={18} />
                把「完成報告」拆成幾個小步驟
              </button>
            )}
          </section>

          <section className="planning-section">
            <div className="editor-section-heading">
              <h3>截止與提醒</h3>
              {due && <span className={`due-chip ${due.tone}`}>{due.label}</span>}
            </div>
            <div className="planning-grid">
              <label>
                <span>
                  <CalendarDays size={16} /> 截止時間
                </span>
                <input
                  type="datetime-local"
                  value={toLocalInputValue(memo.dueAt)}
                  onChange={(event) =>
                    onChange({
                      dueAt: fromLocalInputValue(event.target.value),
                      isTodo: Boolean(event.target.value) || memo.isTodo,
                    })
                  }
                />
              </label>
              <label>
                <span>
                  <Bell size={16} /> 通知時間
                </span>
                <input
                  type="datetime-local"
                  value={toLocalInputValue(memo.reminderAt)}
                  onChange={(event) =>
                    onChange({
                      reminderAt: fromLocalInputValue(event.target.value),
                      lastNotifiedAt: undefined,
                    })
                  }
                />
              </label>
              <label>
                <span>
                  <Clock3 size={16} /> 重複
                </span>
                <select
                  value={memo.repeat}
                  onChange={(event) =>
                    onChange({ repeat: event.target.value as Memo['repeat'] })
                  }
                >
                  <option value="none">不重複</option>
                  <option value="daily">每天</option>
                  <option value="weekly">每週</option>
                </select>
              </label>
              <button
                className="snooze-button"
                disabled={!memo.reminderAt}
                onClick={() =>
                  onChange({
                    reminderAt: new Date(Date.now() + 10 * 60_000).toISOString(),
                    lastNotifiedAt: undefined,
                  })
                }
              >
                <Clock3 size={16} /> 延後 10 分鐘
              </button>
            </div>
          </section>

          <section className="location-section">
            <div className="editor-section-heading">
              <div>
                <h3>到達地點時提醒</h3>
                <span>例如：到學校時提醒交作業</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(memo.locationReminder?.enabled)}
                  onChange={(event) =>
                    onChange((current) => ({
                      locationReminder: current.locationReminder
                        ? { ...current.locationReminder, enabled: event.target.checked }
                        : {
                            label: '學校',
                            latitude: 0,
                            longitude: 0,
                            radius: 200,
                            enabled: event.target.checked,
                          },
                    }))
                  }
                />
                <span />
              </label>
            </div>
            {memo.locationReminder?.enabled && (
              <div className="location-fields">
                <label>
                  地點名稱
                  <input
                    value={memo.locationReminder.label}
                    onChange={(event) =>
                      onChange((current) => ({
                        locationReminder: current.locationReminder
                          ? { ...current.locationReminder, label: event.target.value }
                          : undefined,
                      }))
                    }
                    placeholder="學校"
                  />
                </label>
                <label>
                  範圍
                  <select
                    value={memo.locationReminder.radius}
                    onChange={(event) =>
                      onChange((current) => ({
                        locationReminder: current.locationReminder
                          ? { ...current.locationReminder, radius: Number(event.target.value) }
                          : undefined,
                      }))
                    }
                  >
                    <option value={100}>100 公尺</option>
                    <option value={200}>200 公尺</option>
                    <option value={500}>500 公尺</option>
                  </select>
                </label>
                <button onClick={onUseLocation}>
                  <MapPin size={16} />
                  使用目前位置
                </button>
                {memo.locationReminder.latitude !== 0 && (
                  <small>
                    已設定座標 {memo.locationReminder.latitude.toFixed(4)},{' '}
                    {memo.locationReminder.longitude.toFixed(4)}
                  </small>
                )}
              </div>
            )}
          </section>

          <section className="organize-section">
            <div className="editor-section-heading">
              <h3>整理</h3>
            </div>
            <label className="tag-input">
              <Tag size={16} />
              <input
                value={memo.tags.join(', ')}
                onChange={(event) =>
                  onChange({
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="標籤，用逗號分隔"
              />
            </label>
            <div className="color-picker">
              {(Object.keys(COLOR_LABELS) as MemoColor[]).map((color) => (
                <button
                  key={color}
                  className={`color-choice ${color} ${memo.color === color ? 'active' : ''}`}
                  onClick={() => onChange({ color })}
                >
                  <span />
                  {COLOR_LABELS[color]}
                </button>
              ))}
            </div>
            <div className="editor-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={memo.isTodo}
                  onChange={(event) => onChange({ isTodo: event.target.checked })}
                />
                <span />
                顯示在待辦
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={memo.isCompleted}
                  onChange={(event) =>
                    onChange({ isCompleted: event.target.checked, isTodo: true })
                  }
                />
                <span />
                標記已完成
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={memo.isArchived}
                  onChange={(event) => onChange({ isArchived: event.target.checked })}
                />
                <span />
                封存這則內容
              </label>
            </div>
          </section>

          <footer className="editor-footer">
            <button className="delete-button" onClick={onDelete}>
              <Trash2 size={16} /> 刪除
            </button>
            <span>最後編輯 {formatNoteTime(memo.updatedAt)}</span>
            <button className="primary-button" onClick={onClose}>
              <Check size={17} /> 完成
            </button>
          </footer>
        </div>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            void onFiles(event.target.files, 'image')
            event.target.value = ''
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            void onFiles(event.target.files, 'image')
            event.target.value = ''
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            void onFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </aside>
    </>
  )
}

interface SettingsPageProps {
  memos: Memo[]
  permission: NotificationPermission | 'unsupported'
  onRequestNotifications: () => void
  onExport: () => void
  onShareBackup: () => void
  onImport: () => void
}

function SettingsPage({
  memos,
  permission,
  onRequestNotifications,
  onExport,
  onShareBackup,
  onImport,
}: SettingsPageProps) {
  const attachmentCount = memos.reduce((total, memo) => total + memo.attachments.length, 0)
  return (
    <section className="settings-page">
      <div className="settings-hero">
        <span className="eyebrow">YOUR SPACE</span>
        <h1>設定與備份</h1>
        <p>課刻預設把內容留在這台裝置，不必登入也能使用。</p>
      </div>
      <div className="settings-grid">
        <article className="settings-card featured">
          <div className="settings-icon">
            <CloudUpload size={24} />
          </div>
          <div>
            <span className="eyebrow">BACKUP</span>
            <h2>把筆記帶去雲端</h2>
            <p>匯出完整備份，再選擇 Google Drive、iCloud 或其他分享目的地。</p>
          </div>
          <div className="settings-actions">
            <button className="primary-button" onClick={onShareBackup}>
              <Share2 size={17} /> 分享到雲端
            </button>
            <button className="secondary-button" onClick={onExport}>
              <FileDown size={17} /> 下載備份
            </button>
          </div>
        </article>
        <article className="settings-card">
          <div className="settings-icon coral">
            <BellRing size={23} />
          </div>
          <div>
            <h2>手機通知</h2>
            <p>
              {permission === 'granted'
                ? '通知權限已開啟。網頁版會在 App 開啟時檢查提醒。'
                : '允許通知，才能在指定時間看到提醒。'}
            </p>
          </div>
          <button className="secondary-button" onClick={onRequestNotifications}>
            <Bell size={17} />
            {permission === 'granted' ? '已開啟' : '開啟通知'}
          </button>
        </article>
        <article className="settings-card">
          <div className="settings-icon blue">
            <FileUp size={23} />
          </div>
          <div>
            <h2>還原資料</h2>
            <p>選擇先前匯出的 JSON 備份檔，會取代目前這台裝置的內容。</p>
          </div>
          <button className="secondary-button" onClick={onImport}>
            <FileUp size={17} /> 選擇備份檔
          </button>
        </article>
        <article className="settings-card stats-card">
          <div>
            <span>{memos.length}</span>
            <small>則備忘錄</small>
          </div>
          <div>
            <span>{memos.filter((memo) => memo.isTodo && !memo.isCompleted).length}</span>
            <small>件未完成</small>
          </div>
          <div>
            <span>{attachmentCount}</span>
            <small>個附件</small>
          </div>
        </article>
      </div>
      <div className="privacy-note">
        <CheckCircle2 size={20} />
        <div>
          <strong>離線優先，資料由你掌握</strong>
          <p>
            文字、圖片、錄音與手寫會存在瀏覽器的本機儲存空間。清除瀏覽器資料前，記得先匯出備份。
          </p>
        </div>
      </div>
    </section>
  )
}

export default App
