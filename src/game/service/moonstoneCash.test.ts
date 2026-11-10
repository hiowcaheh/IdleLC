import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { createCharacterData } from '../logic/character.ts'
import { createDefaultSave } from '../logic/save.ts'
import { createRng } from '../logic/rng.ts'
import { countOwned } from '../logic/potions.ts'
import { LocalGameService, SAVE_KEY } from './LocalGameService.ts'
import type { KeyValueStorage } from './GameService.ts'

const NOW = Date.UTC(2026, 10, 10, 12)
function fixture() {
  const c = {
    ...createCharacterData({ name: 'Moon', classId: 'mage' }, 'moon', NOW),
    level: 100,
    inventory: [
      { itemId: 95014, count: 1 },
      { itemId: 2544, count: 25 },
      { itemId: 2548, count: 2 },
    ],
    worldBoss: { kills: { 'lc-zone-0': 2000 }, defeated: {}, active: null },
  }
  const other = createCharacterData({ name: 'Other', classId: 'knight' }, 'other', NOW)
  const save = {
    ...createDefaultSave(NOW),
    cash: 25,
    characters: [c, other],
    activeCharacterId: c.id,
  }
  const data = new Map([[SAVE_KEY, JSON.stringify(save)]])
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
  const make = () => new LocalGameService(storage, { now: () => NOW, rng: createRng(4) })
  return { game: make(), make, writes, read: () => JSON.parse(data.get(SAVE_KEY)!) }
}

describe('Cash ticket and Moonstone service transactions', () => {
  it('credits shared Cash and removes the ticket in one write, with no second redemption after reload', async () => {
    const f = fixture()
    await f.game.load()
    const before = f.read()
    f.writes.length = 0
    const use = await f.game.redeemCashTicket('moon', 95014)
    expect(use.cash).toBe(125)
    expect(f.writes).toHaveLength(1)
    const saved = JSON.parse(f.writes[0]!)
    expect(saved.cash).toBe(125)
    expect(countOwned(saved.characters[0].inventory, 95014)).toBe(0)
    expect(saved.characters[1]).toEqual(before.characters[1])
    const reloaded = f.make()
    expect((await reloaded.load()).save.cash).toBe(125)
    await expect(reloaded.redeemCashTicket('moon', 95014)).rejects.toThrow('not-enough-items')
    expect(f.read().cash).toBe(125)
  })

  it('rejects stale Cash writes and redeems exactly once after loading the newer account', async () => {
    const f = fixture()
    await f.game.load()
    const stale = f.make()
    await stale.load()
    await f.game.dev!.addCash(10)
    const saved = f.read()
    await expect(stale.redeemCashTicket('moon', 95014)).rejects.toThrow('save-conflict')
    expect(f.read()).toEqual(saved)
    await stale.load()
    const use = await stale.redeemCashTicket('moon', 95014)
    expect(use.cash).toBe(135)
    expect(countOwned(use.character.inventory, 95014)).toBe(0)
  })

  it('opens 25 Moonstone Boxes, then pays a single stone play atomically and preserves flags on reload', async () => {
    const f = fixture()
    await f.game.load()
    const boxes = await f.game.openBoxes('moon', 2544, 25)
    expect(boxes.prizes.reduce((sum, p) => sum + p.count, 0)).toBe(25)
    expect(countOwned(boxes.character.inventory, 2544)).toBe(0)
    f.writes.length = 0
    const play = await f.game.playMoonstone('moon', 2548)
    expect(f.writes).toHaveLength(1)
    expect(countOwned(play.character.inventory, 2548)).toBe(1)
    expect(play.character.inventory).toContainEqual(play.prize)
    const loaded = (await f.make().load()).save.characters[0]!
    expect(loaded.inventory).toEqual(play.character.inventory)
    await f.game.playMoonstone('moon', 2548)
    const exhausted = f.read()
    await expect(f.game.playMoonstone('moon', 2548)).rejects.toThrow('not-enough-moonstones')
    expect(f.read()).toEqual(exhausted)
  })

  it('blocks statue plays during a World Boss attempt and a dungeon', async () => {
    const f = fixture()
    await f.game.load()
    await f.game.summonWorldBoss('moon')
    await expect(f.game.playMoonstone('moon', 2548)).rejects.toThrow('world-boss-active')
    await f.game.cancelWorldBoss('moon')
    await f.game.startDungeon('moon', 'belfist')
    await expect(f.game.playMoonstone('moon', 2548)).rejects.toThrow('in-dungeon')
  })
})
