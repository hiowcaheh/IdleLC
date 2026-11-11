import { describe, expect, it, vi } from 'vitest'
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcIcons: (await import('../data/generated/lc-icons.json')).default,
}))
import {
  LOGIN_ONLINE_MS,
  WEEKLY_LOGIN_REWARDS,
  MONTHLY_LOGIN_REWARDS,
  loginReward,
} from '../data/loginCalendar.ts'
import { ITEMS, itemIcon } from '../data/items.ts'
import { createCharacterData } from './character.ts'
import {
  addCalendarOnline,
  calendarDates,
  calendarDay,
  calendarForDay,
  claimLoginCalendar,
  sanitizeLoginCalendar,
} from './loginCalendar.ts'
import { createDefaultSave, loadSave, SAVE_VERSION } from './save.ts'

const NOW = Date.UTC(2026, 10, 10, 12)
const hero = () => createCharacterData({ name: 'Calendar', classId: 'mage' }, 'calendar', NOW)

describe('login calendar', () => {
  it('gives two 500 Cash Tickets each Sunday, including a Sunday at month end', () => {
    for (const time of [
      Date.UTC(2026, 10, 1),
      Date.UTC(2026, 10, 8),
      Date.UTC(2026, 10, 15),
      Date.UTC(2026, 10, 22),
      Date.UTC(2026, 10, 29),
      Date.UTC(2027, 0, 31),
    ]) {
      expect(loginReward('weekly', new Date(time))).toEqual({ itemId: 95015, count: 1 })
      expect(loginReward('monthly', new Date(time))).toEqual({ itemId: 95015, count: 1 })
      const p = addCalendarOnline(undefined, LOGIN_ONLINE_MS, time)
      const won = claimLoginCalendar(hero(), p, time)
      expect(won.character.inventory).toEqual([{ itemId: 95015, count: 2 }])
      expect(() => claimLoginCalendar(won.character, won.calendar, time)).toThrow(
        'calendar-already-claimed',
      )
    }
  })
  it('uses existing items and provides real UTC weeks and leap-month lengths', () => {
    for (const r of [...WEEKLY_LOGIN_REWARDS, ...MONTHLY_LOGIN_REWARDS]) {
      expect(ITEMS[r.itemId]).toBeDefined()
      expect(itemIcon(r.itemId)).not.toBeNull()
      expect(r.count).toBeGreaterThan(0)
    }
    expect(calendarDates('weekly', Date.UTC(2026, 10, 1)).map(calendarDay)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ])
    expect(calendarDates('monthly', Date.UTC(2028, 1, 15))).toHaveLength(29)
    expect(calendarDates('monthly', Date.UTC(2026, 1, 15))).toHaveLength(28)
    expect(loginReward('monthly', new Date(Date.UTC(2028, 1, 29)))).toEqual({
      itemId: 95014,
      count: 1,
    })
    expect(loginReward('monthly', new Date(Date.UTC(2026, 10, 30)))).toEqual({
      itemId: 95014,
      count: 1,
    })
  })
  it('requires exactly ten minutes, pays both tracks once and preserves the input', () => {
    const c = hero()
    const p = addCalendarOnline(undefined, LOGIN_ONLINE_MS - 1, NOW)
    expect(() => claimLoginCalendar(c, p, NOW)).toThrow('calendar-online-required')
    const full = addCalendarOnline(p, 1, NOW)
    const won = claimLoginCalendar(c, full, NOW)
    expect(won.prizes).toEqual([
      { itemId: 85, count: 3 },
      { itemId: 4917, count: 50 },
    ])
    expect(won.character.inventory).toEqual(won.prizes)
    expect(() => claimLoginCalendar(won.character, won.calendar, NOW)).toThrow(
      'calendar-already-claimed',
    )
    expect(full.claimedDays).toEqual([])
    expect(c.inventory).toEqual([])
  })
  it('resets only time on a new day, keeps claims and refuses a backwards clock', () => {
    const p = { day: '2026-11-10', onlineMs: LOGIN_ONLINE_MS, claimedDays: ['2026-11-10'] }
    expect(calendarForDay(p, NOW + 86400000)).toEqual({
      day: '2026-11-11',
      onlineMs: 0,
      claimedDays: ['2026-11-10'],
    })
    expect(calendarForDay(p, NOW - 86400000)).toBe(p)
    expect(() => claimLoginCalendar(hero(), p, NOW - 86400000)).toThrow('calendar-clock-behind')
    expect(addCalendarOnline(p, -100, NOW)).toBe(p)
    expect(addCalendarOnline(p, 100, NOW).onlineMs).toBe(LOGIN_ONLINE_MS)
  })
  it('sanitizes invalid dates, duplicate claims and time without granting another claim', () => {
    expect(sanitizeLoginCalendar({ day: '2026-02-30' })).toBeUndefined()
    expect(
      sanitizeLoginCalendar({
        day: '2026-11-10',
        onlineMs: Infinity,
        claimedDays: ['2026-11-10', '2026-11-10', '2026-11-11', 'bad'],
      }),
    ).toEqual({ day: '2026-11-10', onlineMs: 0, claimedDays: ['2026-11-10'] })
    const p = sanitizeLoginCalendar({
      day: '2026-11-10',
      onlineMs: 999999999,
      claimedDays: ['2026-11-10'],
    })!
    expect(p.onlineMs).toBe(LOGIN_ONLINE_MS)
    expect(() => claimLoginCalendar(hero(), p, NOW)).toThrow('calendar-already-claimed')
  })
  it('migrates v16 without losing Cash, gear, inventory or a reserved Moonstone draw', () => {
    const save = {
      ...createDefaultSave(NOW),
      saveVersion: 16,
      cash: 321,
      characters: [
        {
          ...hero(),
          inventory: [{ itemId: 2547, count: 5 }],
          moonstoneSpin: {
            id: 'saved-spin',
            stoneId: 2548,
            startedAt: NOW,
            prize: { itemId: 498, count: 3, flag: 14 },
          },
        },
      ],
    }
    const loaded = loadSave(JSON.stringify(save), NOW)
    expect(loaded.status).toBe('migrated')
    expect(loaded.save.saveVersion).toBe(SAVE_VERSION)
    expect(loaded.save.cash).toBe(321)
    expect(loaded.save.characters[0]!.inventory).toEqual(save.characters[0]!.inventory)
    expect(loaded.save.characters[0]!.equipment).toEqual(save.characters[0]!.equipment)
    expect(loaded.save.characters[0]!.moonstoneSpin).toEqual(save.characters[0]!.moonstoneSpin)
    expect(loaded.save.loginCalendar).toBeUndefined()
    const p = { day: '2026-11-10', onlineMs: 123456, claimedDays: ['2026-11-09'] }
    expect(
      loadSave(JSON.stringify({ ...loaded.save, loginCalendar: p }), NOW).save.loginCalendar,
    ).toEqual(p)
  })
})
