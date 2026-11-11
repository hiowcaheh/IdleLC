import { describe, expect, it, vi } from 'vitest'
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcIcons: (await import('../data/generated/lc-icons.json')).default,
}))
import { LACABALL_COURSES, TOKEN_ID, GOLD_TOKEN_ID, lacaBallCourses } from '../data/lacaball.ts'
import { CASH_OFFERS } from '../data/cashShop.ts'
import { MOONSTONES } from '../data/moonstones.ts'
import { ITEMS, itemIcon } from '../data/items.ts'
import { createCharacterData } from './character.ts'
import { createDefaultSave, loadSave, SAVE_VERSION } from './save.ts'
import {
  beginLacaBall,
  finishLacaBall,
  lacaBallCost,
  lacaBallPool,
  lacaBallDisplayPool,
  lacaBallDrawDuration,
  sanitizeLacaBall,
  LACABALL_DRAW_MS,
  LACABALL_AUTO_DRAW_MS,
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

describe('modern Laca Ball finite pools', () => {
  it('uses five courses and five stock rows per currency, with one jackpot ticket', () => {
    for (const tokenId of [TOKEN_ID, GOLD_TOKEN_ID]) {
      expect(itemIcon(tokenId)).not.toBeNull()
      const courses = lacaBallCourses(tokenId)
      expect(courses.map((c) => c.code)).toEqual([0, 1, 2, 3, 4])
      for (const c of courses) {
        expect(c.rewards).toHaveLength(5)
        expect(c.rewards[0]!.max).toBe(1)
        expect(lacaBallCost(c.id, tokenId)).toBe(1)
        for (const r of c.rewards) {
          expect(ITEMS[r.itemId]).toBeDefined()
          expect(itemIcon(r.itemId)).not.toBeNull()
          expect(r.itemId).not.toBe(GOLD_TOKEN_ID)
        }
      }
    }
    expect(LACABALL_COURSES[0]!.rewards.map((r) => r.max)).toEqual([1, 10, 5, 50, 1000])
    expect(lacaBallCourses(GOLD_TOKEN_ID)[0]!.rewards.map((r) => r.max)).toEqual([
      1, 10, 30, 50, 500,
    ])
    expect(lacaBallCost(100, GOLD_TOKEN_ID)).toBeNull()
  })
  it('preserves the SubHelper roll boundaries and reserves exactly one prize on every course', () => {
    for (const c of LACABALL_COURSES) {
      const total = c.rewards.reduce((n, r) => n + r.max, 0)
      let before = 0
      for (const [index, r] of c.rewards.entries()) {
        for (const roll of [index === 0 ? 0 : before + 1, Math.min(total - 1, before + r.max)]) {
          const h = hero()
          const s = beginLacaBall(
            h,
            undefined,
            c.id,
            c.tokenId,
            'draw',
            NOW,
            () => (roll + 0.1) / total,
          )
          expect(s.draw.rewardIndex).toBe(index)
          expect(s.draw.prize).toEqual({ itemId: r.itemId, count: r.count })
          expect(s.character.inventory.find((i) => i.itemId === c.tokenId)!.count).toBe(99)
          expect(s.character.inventory.some((i) => i.itemId === r.itemId)).toBe(false)
          const reserved = lacaBallPool(s.progress, c.id)
          expect(reserved[index]).toBe(r.max - 1)
          expect(reserved.reduce((n, v) => n + v, 0)).toBe(total - 1)
          expect(lacaBallDisplayPool(s.progress, c.id)).toEqual(c.rewards.map((r) => r.max))
          expect(() =>
            finishLacaBall(s.character, s.progress, 'draw', NOW + LACABALL_DRAW_MS - 1),
          ).toThrow('lacaball-not-ready')
          const won = finishLacaBall(s.character, s.progress, 'draw', NOW + LACABALL_DRAW_MS)
          expect(won.character.inventory).toContainEqual(s.draw.prize)
          expect(lacaBallPool(won.progress, c.id)).toEqual(
            index === 0 ? c.rewards.map((r) => r.max) : reserved,
          )
          expect(() => finishLacaBall(won.character, won.progress, 'draw', NOW + 10000)).toThrow(
            'lacaball-expired',
          )
          expect(h.inventory[0]!.count).toBe(100)
        }
        before += r.max
      }
    }
  })
  it('does not draw empty rows and resets only the winning currency/course after the jackpot', () => {
    let p = {
      pools: { '100': [1, 2, 0, 0, 3], '101': [1, 0, 4, 20, 700], '200': [1, 2, 3, 4, 200] },
    }
    let h = hero()
    for (let n = 0; n < 2; n++) {
      const s = beginLacaBall(h, p, 100, TOKEN_ID, `common-${n}`, NOW, () => 0.4)
      expect(s.draw.rewardIndex).toBe(1)
      const won = finishLacaBall(s.character, s.progress, s.draw.id, NOW + LACABALL_DRAW_MS)
      h = won.character
      p = won.progress as typeof p
    }
    expect(lacaBallPool(p, 100)).toEqual([1, 0, 0, 0, 3])
    const common = beginLacaBall(h, p, 100, TOKEN_ID, 'empty-skipped', NOW, () => 0.8)
    expect(common.draw.rewardIndex).toBe(4)
    const won = finishLacaBall(
      common.character,
      common.progress,
      common.draw.id,
      NOW + LACABALL_DRAW_MS,
    )
    const jackpot = beginLacaBall(
      won.character,
      won.progress,
      100,
      TOKEN_ID,
      'jackpot',
      NOW,
      () => 0,
    )
    expect(lacaBallPool(jackpot.progress, 100)[0]).toBe(0)
    const reset = finishLacaBall(
      jackpot.character,
      jackpot.progress,
      'jackpot',
      NOW + LACABALL_DRAW_MS,
    )
    expect(lacaBallPool(reset.progress, 100)).toEqual([1, 10, 5, 50, 1000])
    expect(reset.progress.pools['101']).toEqual(p.pools['101'])
    expect(reset.progress.pools['200']).toEqual(p.pools['200'])
  })
  it('stores Auto x2 speed, pays at 1000/2000 ms and restores the same stock and result after reload', () => {
    for (const auto of [false, true]) {
      const s = beginLacaBall(hero(), undefined, 100, TOKEN_ID, 'saved', NOW, () => 0.999, auto)
      const duration = auto ? LACABALL_AUTO_DRAW_MS : LACABALL_DRAW_MS
      expect(lacaBallDrawDuration(s.draw)).toBe(duration)
      const saved = {
        ...createDefaultSave(NOW),
        cash: 123,
        characters: [s.character],
        lacaBall: s.progress,
      }
      const loaded = loadSave(JSON.stringify(saved), NOW + 500)
      expect(loaded.save.lacaBall).toEqual(s.progress)
      expect(loaded.save.cash).toBe(123)
      expect(() =>
        finishLacaBall(s.character, loaded.save.lacaBall, 'saved', NOW + duration - 1),
      ).toThrow('lacaball-not-ready')
      expect(
        finishLacaBall(s.character, loaded.save.lacaBall, 'saved', NOW + duration).prize,
      ).toEqual(s.draw.prize)
    }
  })
  it('migrates a paid v18 legacy draw without another fee or changing its promised prize/time', () => {
    const h = hero()
    const pending = {
      id: 'old',
      characterId: h.id,
      courseId: 3,
      tokenId: GOLD_TOKEN_ID,
      cost: 2,
      startedAt: NOW,
      prize: { itemId: 95016, count: 3 },
    }
    const save = {
      ...createDefaultSave(NOW),
      saveVersion: 18,
      characters: [h],
      lacaBall: { repeat: 12, lastPlayedAt: NOW, pending },
    }
    const loaded = loadSave(JSON.stringify(save), NOW)
    expect(loaded.status).toBe('migrated')
    expect(loaded.save.saveVersion).toBe(SAVE_VERSION)
    expect(loaded.save.lacaBall?.pending).toEqual(pending)
    expect(() => finishLacaBall(h, loaded.save.lacaBall, 'old', NOW + 3199)).toThrow(
      'lacaball-not-ready',
    )
    const won = finishLacaBall(h, loaded.save.lacaBall, 'old', NOW + 3200)
    expect(won.character.inventory).toContainEqual(pending.prize)
    expect(won.character.inventory.find((i) => i.itemId === GOLD_TOKEN_ID)!.count).toBe(100)
    expect(won.progress).toEqual({ pools: {} })
  })
  it('repairs invalid stock and preserves a valid reserved jackpot through sanitization', () => {
    const s = beginLacaBall(hero(), undefined, 100, TOKEN_ID, 'valid', NOW, () => 0)
    expect(sanitizeLacaBall(s.progress, ['laca'])).toEqual(s.progress)
    const repaired = sanitizeLacaBall(
      { pools: { 100: [0, -1, 5, 50, 1000], 101: [0, 1, 1, 1, 1], 200: [1, 999, 1, 1, 1] } },
      ['laca'],
    )!
    expect(lacaBallPool(repaired, 100)).toEqual([1, 10, 5, 50, 1000])
    expect(lacaBallPool(repaired, 101)[0]).toBe(1)
    expect(lacaBallPool(repaired, 200)[1]).toBe(10)
    expect(
      sanitizeLacaBall({ ...s.progress, pending: { ...s.draw, characterId: 'missing' } }, ['laca'])
        ?.pending,
    ).toBeUndefined()
  })
  it('rejects unknown stakes, insufficient tokens, concurrent reservations and wrong claim IDs', () => {
    expect(() => beginLacaBall(hero(), undefined, 100, 19, 'x', NOW, () => 0)).toThrow(
      'lacaball-invalid-stake',
    )
    expect(() => beginLacaBall(hero(), undefined, 999, TOKEN_ID, 'x', NOW, () => 0)).toThrow(
      'lacaball-invalid-stake',
    )
    expect(() =>
      beginLacaBall({ ...hero(), inventory: [] }, undefined, 100, TOKEN_ID, 'x', NOW, () => 0),
    ).toThrow('lacaball-not-enough-tokens')
    const s = beginLacaBall(hero(), undefined, 100, TOKEN_ID, 'x', NOW, () => 0)
    expect(() =>
      beginLacaBall(s.character, s.progress, 200, GOLD_TOKEN_ID, 'other', NOW, () => 0),
    ).toThrow('lacaball-pending')
    expect(() => finishLacaBall({ ...hero(), id: 'other' }, s.progress, 'x', NOW + 10000)).toThrow(
      'lacaball-expired',
    )
    expect(() => finishLacaBall(s.character, s.progress, 'wrong', NOW + 10000)).toThrow(
      'lacaball-expired',
    )
  })
  it('keeps the requested shop packs and Gold Tokens out of non-shop rewards', () => {
    expect(CASH_OFFERS.find((o) => o.id === 'lacaball-token-100')).toMatchObject({
      price: 1000,
      items: [{ itemId: TOKEN_ID, count: 100 }],
    })
    expect(CASH_OFFERS.find((o) => o.id === 'lacaball-gold-token-50')).toMatchObject({
      price: 750,
      items: [{ itemId: GOLD_TOKEN_ID, count: 50 }],
    })
    expect(MOONSTONES.flatMap((s) => s.rewards).some((r) => r.itemId === GOLD_TOKEN_ID)).toBe(false)
  })
})

describe('fixed per-monster Token drop', () => {
  it('includes the inclusive 1% boundary even for blue mobs and ignores drop buffs', () => {
    const h = { ...hero(), level: 100 }
    const m = { ...getMonster('lc-1'), level: 1 }
    for (const drop of [1, 1000]) {
      expect(
        rewardKills(h, m, 1, () => 99 / 10000, NOW, { exp: 1, sp: 1, gold: 1, drop }).drops,
      ).toEqual([{ itemId: TOKEN_ID, count: 1 }])
      expect(
        rewardKills(h, m, 1, () => 100 / 10000, NOW, { exp: 1, sp: 1, gold: 1, drop }).drops,
      ).toEqual([])
    }
  })
  it('adds the same independent roll for bosses without changing fixed prizes', () => {
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
