import { describe, expect, it, vi } from 'vitest'
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcIcons: (await import('../data/generated/lc-icons.json')).default,
}))
import { LACABALL_COURSES, TOKEN_ID, GOLD_TOKEN_ID } from '../data/lacaball.ts'
import { CASH_OFFERS } from '../data/cashShop.ts'
import { MOONSTONES } from '../data/moonstones.ts'
import { ITEMS, itemIcon } from '../data/items.ts'
import { createCharacterData } from './character.ts'
import { createDefaultSave, loadSave, SAVE_VERSION } from './save.ts'
import {
  beginLacaBall,
  finishLacaBall,
  lacaBallCost,
  lacaBallRepeat,
  LACABALL_DRAW_MS,
  LACABALL_RESET_MS,
} from './lacaball.ts'
import { rewardKills } from './rewards.ts'
import { getMonster } from '../data/monsters.ts'

const NOW = Date.UTC(2026, 10, 11, 12)
const hero = () => ({
  ...createCharacterData({ name: 'Laca', classId: 'mage' }, 'laca', NOW),
  inventory: [
    { itemId: TOKEN_ID, count: 100 },
    { itemId: GOLD_TOKEN_ID, count: 100 },
  ],
})

describe('Laca Ball source rules and owner rewards', () => {
  it('has exactly three live courses and ten source-weighted known, illustrated prizes per course', () => {
    expect(LACABALL_COURSES.map((c) => c.id)).toEqual([1, 2, 3])
    for (const id of [TOKEN_ID, GOLD_TOKEN_ID]) expect(itemIcon(id)).not.toBeNull()
    for (const c of LACABALL_COURSES) {
      expect(c.rewards).toHaveLength(10)
      expect(c.rewards.reduce((n, r) => n + r.weight, 0)).toBe(10000)
      for (const r of c.rewards) {
        expect(ITEMS[r.itemId]).toBeDefined()
        expect(itemIcon(r.itemId)).not.toBeNull()
        expect(r.itemId).not.toBe(GOLD_TOKEN_ID)
      }
    }
    expect(LACABALL_COURSES[0]!.rewards.map((r) => r.weight)).toEqual([
      10, 100, 390, 700, 800, 1000, 1500, 1500, 2000, 2000,
    ])
  })
  it('matches original base costs, account repetition increases and 24h inactivity reset', () => {
    expect([0, 1, 4, 5, 9, 10].map((r) => lacaBallCost(1, TOKEN_ID, r))).toEqual([2, 2, 2, 3, 3, 4])
    expect(lacaBallCost(2, TOKEN_ID, 5)).toBe(4)
    expect(lacaBallCost(3, TOKEN_ID, 0)).toBeNull()
    for (const r of [0, 1, 5, 1000]) {
      expect(lacaBallCost(1, GOLD_TOKEN_ID, r)).toBe(1)
      expect(lacaBallCost(2, GOLD_TOKEN_ID, r)).toBe(1)
      expect(lacaBallCost(3, GOLD_TOKEN_ID, r)).toBe(2)
    }
    const p = { repeat: 20, lastPlayedAt: NOW }
    expect(lacaBallRepeat(p, NOW + LACABALL_RESET_MS - 1)).toBe(20)
    expect(lacaBallRepeat(p, NOW + LACABALL_RESET_MS)).toBe(0)
  })
  it('selects both ends of all source intervals, reserves once and pays only after the animation', () => {
    for (const c of LACABALL_COURSES) {
      let start = 0
      for (const r of c.rewards) {
        for (const roll of [start + 0.5, start + r.weight - 0.5]) {
          const h = hero()
          const stake = c.stakes[0]!
          const s = beginLacaBall(h, undefined, c.id, stake.itemId, 'draw', NOW, () => roll / 10000)
          expect(s.draw.prize).toEqual({ itemId: r.itemId, count: r.count })
          expect(s.character.inventory.find((i) => i.itemId === stake.itemId)!.count).toBe(
            100 - stake.base,
          )
          expect(s.character.inventory.some((i) => i.itemId === r.itemId)).toBe(false)
          expect(() =>
            finishLacaBall(s.character, s.progress, 'draw', NOW + LACABALL_DRAW_MS - 1),
          ).toThrow('lacaball-not-ready')
          expect(() =>
            beginLacaBall(s.character, s.progress, c.id, stake.itemId, 'again', NOW, () => 0),
          ).toThrow('lacaball-pending')
          const won = finishLacaBall(s.character, s.progress, 'draw', NOW + LACABALL_DRAW_MS)
          expect(won.character.inventory).toContainEqual(s.draw.prize)
          expect(() =>
            finishLacaBall(won.character, won.progress, 'draw', NOW + LACABALL_DRAW_MS),
          ).toThrow('lacaball-expired')
          expect(h.inventory[0]!.count).toBe(100)
        }
        start += r.weight
      }
    }
  })
  it('rejects unknown currencies, insufficient stakes, another character and wrong result IDs', () => {
    expect(() => beginLacaBall(hero(), undefined, 1, 19, 'x', NOW, () => 0)).toThrow(
      'lacaball-invalid-stake',
    )
    expect(() => beginLacaBall(hero(), undefined, 4, TOKEN_ID, 'x', NOW, () => 0)).toThrow(
      'lacaball-invalid-stake',
    )
    expect(() =>
      beginLacaBall(
        { ...hero(), inventory: [{ itemId: TOKEN_ID, count: 1 }] },
        undefined,
        1,
        TOKEN_ID,
        'x',
        NOW,
        () => 0,
      ),
    ).toThrow('lacaball-not-enough-tokens')
    const s = beginLacaBall(hero(), undefined, 1, TOKEN_ID, 'x', NOW, () => 0)
    expect(() => finishLacaBall({ ...hero(), id: 'other' }, s.progress, 'x', NOW + 10000)).toThrow(
      'lacaball-expired',
    )
    expect(() => finishLacaBall(s.character, s.progress, 'wrong', NOW + 10000)).toThrow(
      'lacaball-expired',
    )
  })
  it('migrates v17 without losing progress and restores exactly the reserved draw', () => {
    const s = beginLacaBall(hero(), undefined, 2, TOKEN_ID, 'saved', NOW, () => 0)
    const save = {
      ...createDefaultSave(NOW),
      saveVersion: 17,
      cash: 123,
      characters: [s.character],
      activeCharacterId: s.character.id,
      lacaBall: s.progress,
    }
    const loaded = loadSave(JSON.stringify(save), NOW + 10000)
    expect(loaded.status).toBe('migrated')
    expect(loaded.save.saveVersion).toBe(SAVE_VERSION)
    expect(loaded.save.cash).toBe(123)
    expect(loaded.save.lacaBall).toEqual(s.progress)
    expect(loaded.save.characters[0]!.inventory).toEqual(s.character.inventory)
    expect(
      finishLacaBall(loaded.save.characters[0]!, loaded.save.lacaBall, 'saved', NOW + 10000).prize,
    ).toEqual(s.draw.prize)
  })
  it('sells the requested packs and keeps Gold Tokens out of every new statue draw', () => {
    expect(CASH_OFFERS.find((o) => o.id === 'lacaball-token-100')).toMatchObject({
      price: 1000,
      items: [{ itemId: TOKEN_ID, count: 100 }],
    })
    expect(CASH_OFFERS.find((o) => o.id === 'lacaball-gold-token-50')).toMatchObject({
      price: 750,
      items: [{ itemId: GOLD_TOKEN_ID, count: 50 }],
    })
    expect(MOONSTONES.flatMap((s) => s.rewards).some((r) => r.itemId === GOLD_TOKEN_ID)).toBe(false)
    expect(MOONSTONES.find((s) => s.itemId === 2548)!.rewards).toContainEqual({
      itemId: TOKEN_ID,
      count: 3,
      weight: 60000,
      flag: 0,
    })
  })
})

describe('fixed per-monster Token drop', () => {
  it('includes the inclusive 1% boundary even for blue mobs and ignores drop buffs', () => {
    const h = { ...hero(), level: 100 }
    const m = { ...getMonster('lc-1'), level: 1 }
    for (const drop of [1, 1000]) {
      const rewards = rewardKills(h, m, 1, () => 99 / 10000, NOW, { exp: 1, sp: 1, gold: 1, drop })
      expect(rewards.drops).toEqual([{ itemId: TOKEN_ID, count: 1 }])
      expect(
        rewardKills(h, m, 1, () => 100 / 10000, NOW, { exp: 1, sp: 1, gold: 1, drop }).drops,
      ).toEqual([])
    }
  })
  it('adds the same independent roll for bosses without changing their fixed prizes', () => {
    const rewards = rewardKills(
      hero(),
      { ...getMonster('lc-1'), level: 100 },
      3,
      () => 0,
      NOW,
      { exp: 1, sp: 1, gold: 1, drop: 1000 },
      () => [{ itemId: 85, count: 1 }],
    )
    expect(rewards.drops).toEqual([
      { itemId: 85, count: 3 },
      { itemId: TOKEN_ID, count: 3 },
    ])
    expect(rewardKills(hero(), getMonster('lc-1'), 0, () => 0, NOW).drops).toEqual([])
  })
})
