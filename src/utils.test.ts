import { describe, expect, it } from 'vitest'
import { distanceInMeters, getDueStatus, nextReminder } from './utils'

describe('getDueStatus', () => {
  const now = new Date('2026-07-31T10:00:00+08:00')

  it('identifies deadlines students need to see', () => {
    expect(getDueStatus('2026-07-31T23:59:00+08:00', false, now)?.label).toBe('今天到期')
    expect(getDueStatus('2026-08-02T12:00:00+08:00', false, now)?.tone).toBe('soon')
    expect(getDueStatus('2026-07-29T12:00:00+08:00', false, now)?.tone).toBe('overdue')
    expect(getDueStatus('2026-07-29T12:00:00+08:00', true, now)?.tone).toBe('done')
  })
})

describe('reminders and locations', () => {
  it('advances repeating reminders', () => {
    expect(nextReminder('2026-07-31T02:00:00.000Z', 'daily')).toBe(
      '2026-08-01T02:00:00.000Z',
    )
    expect(nextReminder('2026-07-31T02:00:00.000Z', 'weekly')).toBe(
      '2026-08-07T02:00:00.000Z',
    )
  })

  it('calculates a nearby distance', () => {
    const distance = distanceInMeters(
      { latitude: 25.1502, longitude: 121.7727 },
      { latitude: 25.1503, longitude: 121.7728 },
    )
    expect(distance).toBeGreaterThan(0)
    expect(distance).toBeLessThan(20)
  })
})
