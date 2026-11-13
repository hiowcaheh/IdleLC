import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { getItem } from '../data/items.ts'
import { MONSTERS } from '../data/monsters.ts'
import type { CombatStats } from '../data/types.ts'
import { boostEffect, createCombat, drinkPotion, effectRewardMultipliers } from './combat.ts'
import { rollSourceDrops } from './loot.ts'
import { rewardKills } from './rewards.ts'
import { createRng } from './rng.ts'
import { CASH_ONLY_GOODS, shopOffer } from './shop.ts'
import { ZONES } from '../data/zones.ts'

const effect = (itemId: number) => {
  const potion = getItem(itemId).potion!
  return boostEffect(itemId, getItem(itemId).name, potion, potion.duration)
}

const stats = (): CombatStats => ({
  maxHp: 100,
  attack: 10,
  defense: 5,
  attackInterval: 1.5,
  critChance: 0,
  critMultiplier: 1.5,
})

describe('reward scrolls and pills (owner, 2026-11-13: as the server runs them)', () => {
  it('are boosts with their source durations', () => {
    expect(getItem(972).potion).toMatchObject({ kind: 'boost', duration: 600 })
    expect(getItem(5080).potion).toMatchObject({ kind: 'boost', duration: 3600 })
    expect(getItem(2141).potion).toMatchObject({ kind: 'boost', duration: 3600, lucky: true })
    expect(getItem(971).potion?.rewards).toEqual({ exp: 50, sp: 0, gold: 0, drop: 0 })
    expect(getItem(973).potion?.rewards).toEqual({ exp: 0, sp: 50, gold: 0, drop: 0 })
  })

  it('hcSPPlusPer100 is summed: Platinum pill +200 and Platinum Training +50 make ×3.5', () => {
    const rates = effectRewardMultipliers([effect(2453), effect(2140)])
    expect(rates.sp).toBeCloseTo(3.5)
    expect(rates.exp).toBe(1)
  })

  it('scrolls are steps of their own: Iris ×2 and Experience Scroll ×1.5 make ×3', () => {
    expect(effectRewardMultipliers([effect(1288), effect(971)]).exp).toBeCloseTo(3)
    expect(effectRewardMultipliers([effect(972)]).drop).toBe(2)
    expect(effectRewardMultipliers([effect(5081)]).drop).toBe(4)
    expect(effectRewardMultipliers([effect(2141)])).toEqual({
      exp: 1,
      sp: 1,
      gold: 1,
      drop: 1,
      lucky: true,
    })
  })

  it('Lucky Scroll and Huge Lucky Scroll are one skill with SF_NOTDUPLICATE: no second one', () => {
    const fight = createCombat({ level: 30, stats: stats() }, 'm', { level: 1, stats: stats() })
    const potion = (id: number) => ({
      itemId: id,
      name: getItem(id).name,
      count: 1,
      potion: getItem(id).potion!,
    })
    const first = drinkPotion(fight, potion(972)).state
    first.player.potionCooldowns = {}
    const second = drinkPotion(first, potion(5080))
    expect(second.problem).not.toBeNull()
    const lucky = second.state.player.effects.filter((e) => e.itemId === 972 || e.itemId === 5080)
    expect(lucky.map((e) => e.itemId)).toEqual([972])
    // hcScrollDrop is one flag for both: never ×4 from the two
    expect(effectRewardMultipliers(second.state.player.effects).drop).toBe(2)
  })

  it('Lucky Spell Book doubles the gold of about 80% of the kills that drop gold', () => {
    const monster = MONSTERS['lc-145']!
    const hero = { classId: 'knight' as const, level: monster.level, exp: 0 }
    const plain = rewardKills(hero, monster, 2000, createRng(5), 0)
    const lucky = rewardKills(hero, monster, 2000, createRng(5), 0, {
      exp: 1,
      sp: 1,
      gold: 1,
      drop: 1,
      lucky: true,
    })
    expect(lucky.gold / plain.gold).toBeGreaterThan(1.65)
    expect(lucky.gold / plain.gold).toBeLessThan(1.95)
  })

  it("Lucky Spell Book doubles a drop roll's chance 20% of the time", () => {
    const slots = Array.from({ length: 20 }, () => ({ itemId: 19, chance: 0.1 }))
    const count = (lucky: boolean) =>
      rollSourceDrops(slots, 20000, createRng(9), 1, lucky)[0]!.count / (20000 * 4)
    expect(count(false)).toBeCloseTo(0.1, 2)
    // 80% × 10% + 20% × 20% = 12%
    expect(count(true)).toBeCloseTo(0.12, 2)
  })
})

describe('Cash-only boosts (owner, 2026-11-13)', () => {
  it('Platinum Adrenaline and Super Haste are no gold shop goods in any zone', () => {
    for (const zone of Object.values(ZONES)) {
      const goods = shopOffer({
        classId: 'knight',
        level: 50,
        location: { zoneId: zone.id, monsterId: zone.monsterIds[0]! },
      }).goods
      for (const id of CASH_ONLY_GOODS) expect(goods).not.toContain(id)
      expect(goods).toContain(6916)
    }
  })
})
