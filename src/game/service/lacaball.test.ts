import { describe, expect, it, vi } from 'vitest'
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))
import { createCharacterData } from '../logic/character.ts'
import { createDefaultSave } from '../logic/save.ts'
import { LACABALL_DRAW_MS } from '../logic/lacaball.ts'
import { LocalGameService, SAVE_KEY } from './LocalGameService.ts'
import type { KeyValueStorage } from './GameService.ts'

const NOW = Date.UTC(2026, 10, 11, 12)
function fixture(rng = () => 0) {
  const clock = { now: NOW }
  const character = {
    ...createCharacterData({ name: 'Laca', classId: 'mage' }, 'laca', NOW),
    inventory: [
      { itemId: 5123, count: 100 },
      { itemId: 5124, count: 50 },
    ],
  }
  const other = {
    ...createCharacterData({ name: 'Other', classId: 'knight' }, 'other', NOW),
    inventory: [{ itemId: 5123, count: 5 }],
  }
  const data = new Map([
    [
      SAVE_KEY,
      JSON.stringify({
        ...createDefaultSave(NOW),
        cash: 1750,
        characters: [character, other],
        activeCharacterId: character.id,
      }),
    ],
  ])
  const writes: string[] = []
  const storage: KeyValueStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
      writes.push(value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
  const make = () => new LocalGameService(storage, { now: () => clock.now, rng })
  return { game: make(), make, clock, writes, read: () => JSON.parse(data.get(SAVE_KEY)!) }
}
describe('Laca Ball account transactions', () => {
  it('shares persisted stock across characters and keeps Auto duration through reload', async () => {
    const f = fixture(() => 0.999)
    await f.game.load()
    const first = await f.game.beginLacaBall('laca', 100, 5123, true)
    expect(first.draw.durationMs).toBe(1000)
    const reload = f.make()
    await reload.load()
    f.clock.now += 999
    await expect(reload.finishLacaBall('laca', first.draw.id)).rejects.toThrow('lacaball-not-ready')
    f.clock.now++
    await reload.finishLacaBall('laca', first.draw.id)
    expect(f.read().lacaBall.pools['100'][4]).toBe(999)
    const second = await reload.beginLacaBall('other', 100, 5123)
    expect(second.progress.pools['100']![4]).toBe(998)
    expect(second.character.inventory).toEqual([{ itemId: 5123, count: 4 }])
  })
  it('reserves in one write, resumes the same draw on reload, and pays only once at the deadline', async () => {
    const f = fixture()
    await f.game.load()
    f.writes.length = 0
    const s = await f.game.beginLacaBall('laca', 100, 5123)
    expect(f.writes).toHaveLength(1)
    expect(f.read().characters[0].inventory).toEqual([
      { itemId: 5123, count: 99 },
      { itemId: 5124, count: 50 },
    ])
    const reload = f.make()
    const loaded = await reload.load()
    expect(loaded.save.lacaBall?.pending).toEqual(s.draw)
    await expect(reload.beginLacaBall('other', 100, 5123)).rejects.toThrow('lacaball-pending')
    f.clock.now += LACABALL_DRAW_MS - 1
    await expect(reload.finishLacaBall('laca', s.draw.id)).rejects.toThrow('lacaball-not-ready')
    f.clock.now++
    f.writes.length = 0
    const won = await reload.finishLacaBall('laca', s.draw.id)
    expect(won.prize).toEqual({ itemId: 95015, count: 1 })
    expect(won.character.inventory).toContainEqual(won.prize)
    expect(f.writes).toHaveLength(1)
    const again = f.make()
    await again.load()
    await expect(again.finishLacaBall('laca', s.draw.id)).rejects.toThrow('lacaball-expired')
    expect(f.read().lacaBall).toEqual({ pools: { '100': [1, 10, 5, 50, 1000] } })
  })
  it('keeps purchases during the animation and buys both packs for the requested Cash prices', async () => {
    const f = fixture()
    await f.game.load()
    const s = await f.game.beginLacaBall('laca', 100, 5123)
    await f.game.buyCashOffer('laca', 'lacaball-token-100', 1)
    await f.game.buyCashOffer('laca', 'lacaball-gold-token-50', 1)
    f.clock.now += LACABALL_DRAW_MS
    const won = await f.game.finishLacaBall('laca', s.draw.id)
    expect(won.character.inventory).toContainEqual({ itemId: 5123, count: 199 })
    expect(won.character.inventory).toContainEqual({ itemId: 5124, count: 100 })
    expect(f.read().cash).toBe(0)
  })
  it('rejects stale account writes without keeping an unpaid draw or paying twice', async () => {
    const f = fixture()
    await f.game.load()
    const stale = f.make()
    await stale.load()
    await f.game.dev!.addCash(1)
    await expect(stale.beginLacaBall('laca', 100, 5123)).rejects.toThrow('save-conflict')
    expect(f.read().lacaBall).toBeUndefined()
    await stale.load()
    const s = await stale.beginLacaBall('laca', 100, 5123)
    const another = f.make()
    await another.load()
    f.clock.now += LACABALL_DRAW_MS
    await stale.finishLacaBall('laca', s.draw.id)
    await expect(another.finishLacaBall('laca', s.draw.id)).rejects.toThrow('save-conflict')
    expect(
      f.read().characters[0].inventory.filter((i: { itemId: number }) => i.itemId === 95015),
    ).toEqual([{ itemId: 95015, count: 1 }])
  })
})
