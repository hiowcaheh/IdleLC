import { describe, expect, it, vi } from 'vitest'
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))
import { LOGIN_ONLINE_MS } from '../data/loginCalendar.ts'
import { createCharacterData } from '../logic/character.ts'
import { createDefaultSave } from '../logic/save.ts'
import { LocalGameService, SAVE_KEY } from './LocalGameService.ts'
import type { KeyValueStorage } from './GameService.ts'

const NOW = Date.UTC(2026, 10, 10, 12)
function fixture(onlineMs = 0, now = NOW) {
  const clock = { now }
  const c = createCharacterData({ name: 'Login', classId: 'mage' }, 'one', now)
  const other = createCharacterData({ name: 'Other', classId: 'knight' }, 'two', now)
  const saved = {
    ...createDefaultSave(now),
    characters: [c, other],
    activeCharacterId: 'one',
    loginCalendar: { day: '2026-11-10', onlineMs, claimedDays: [] },
  }
  const data = new Map([[SAVE_KEY, JSON.stringify(saved)]])
  const writes: string[] = []
  const storage: KeyValueStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
      writes.push(v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
  const make = () => new LocalGameService(storage, { now: () => clock.now })
  return { game: make(), make, clock, writes, read: () => JSON.parse(data.get(SAVE_KEY)!) }
}

describe('account login calendar service', () => {
  it('counts real heartbeat time, independent of DEV speed and missing game frames', async () => {
    const f = fixture()
    await f.game.load()
    await f.game.calendarPresence('one', true)
    f.game.dev!.setTimeScale(20)
    f.clock.now += 5000
    expect((await f.game.calendarPresence('one', true)).onlineMs).toBe(5000)
    f.clock.now += 60000
    expect((await f.game.calendarPresence('one', true)).onlineMs).toBe(5000)
    f.clock.now += 5000
    expect((await f.game.calendarPresence('one', true)).onlineMs).toBe(10000)
  })
  it('earns ten minutes in repeated real intervals and pays the last millisecond once', async () => {
    const f = fixture()
    await f.game.load()
    await f.game.calendarPresence('one', true)
    for (let i = 0; i < 119; i++) {
      f.clock.now += 5000
      await f.game.calendarPresence('one', true)
    }
    f.clock.now += 4999
    await expect(f.game.claimLoginCalendar('one')).rejects.toThrow('calendar-online-required')
    f.clock.now += 1
    f.writes.length = 0
    const won = await f.game.claimLoginCalendar('one')
    expect(won.calendar.onlineMs).toBe(LOGIN_ONLINE_MS)
    expect(won.calendar.claimedDays).toEqual(['2026-11-10'])
    expect(won.prizes).toEqual([
      { itemId: 85, count: 3 },
      { itemId: 4917, count: 50 },
    ])
    expect(f.writes).toHaveLength(1)
    expect(f.read().characters[0].inventory).toEqual(won.prizes)
    const after = f.read()
    await expect(f.game.claimLoginCalendar('one')).rejects.toThrow('calendar-already-claimed')
    expect(f.read()).toEqual(after)
  })
  it('preserves partial time across hidden tabs and reload, without offline credit', async () => {
    const f = fixture()
    await f.game.load()
    await f.game.calendarPresence('one', true)
    f.clock.now += 5000
    await f.game.calendarPresence('one', false)
    f.clock.now += 3600000
    expect((await f.game.calendarPresence('one', true)).onlineMs).toBe(5000)
    f.clock.now += 5000
    await f.game.calendarPresence('one', true)
    const fresh = f.make()
    await fresh.load()
    f.clock.now += 3600000
    expect((await fresh.calendarPresence('one', true)).onlineMs).toBe(10000)
    f.clock.now += 5000
    expect((await fresh.calendarPresence('one', true)).onlineMs).toBe(15000)
  })
  it('shares the daily limit across characters and saves a claim through reload', async () => {
    const f = fixture(LOGIN_ONLINE_MS)
    await f.game.load()
    await f.game.claimLoginCalendar('one')
    await f.game.setActiveCharacter('two')
    await expect(f.game.claimLoginCalendar('two')).rejects.toThrow('calendar-already-claimed')
    const fresh = f.make()
    await fresh.load()
    await expect(fresh.claimLoginCalendar('two')).rejects.toThrow('calendar-already-claimed')
    expect(f.read().characters[1].inventory).toEqual([])
  })
  it('allocates only post-midnight seconds to a new day and prevents clock rollback', async () => {
    const f = fixture(LOGIN_ONLINE_MS, Date.UTC(2026, 10, 10, 23, 59, 57))
    await f.game.load()
    await f.game.claimLoginCalendar('one')
    await f.game.calendarPresence('one', true)
    f.clock.now += 5000
    const p = await f.game.calendarPresence('one', true)
    expect(p).toEqual({ day: '2026-11-11', onlineMs: 2000, claimedDays: ['2026-11-10'] })
    await expect(f.game.claimLoginCalendar('one')).rejects.toThrow('calendar-online-required')
    f.clock.now -= 86400000
    await f.game.calendarPresence('one', true)
    await expect(f.game.claimLoginCalendar('one')).rejects.toThrow('calendar-clock-behind')
    expect(f.read().loginCalendar.day).toBe('2026-11-11')
  })
  it('rejects stale concurrent claims and rolls memory back without a second payout', async () => {
    const f = fixture(LOGIN_ONLINE_MS)
    await f.game.load()
    const stale = f.make()
    await stale.load()
    await f.game.claimLoginCalendar('one')
    const won = f.read()
    await expect(stale.claimLoginCalendar('one')).rejects.toThrow('save-conflict')
    await expect(stale.claimLoginCalendar('one')).rejects.toThrow('save-conflict')
    expect(f.read()).toEqual(won)
    await stale.load()
    await expect(stale.claimLoginCalendar('one')).rejects.toThrow('calendar-already-claimed')
  })
})
