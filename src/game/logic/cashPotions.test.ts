import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { getItem } from '../data/items.ts'
import { boostEffect, effectRewardMultipliers } from './combat.ts'

const effect = (itemId: number) => {
  const item = getItem(itemId)
  expect(item.potion?.kind).toBe('boost')
  return boostEffect(itemId, item.name, item.potion!, item.potion!.duration)
}
const stat = (itemId: number, key: string) => effect(itemId).stats.filter((s) => s.stat === key)

describe('potions of the owner list (2026-11-07), as the server runs them', () => {
  it('steal potions and the Berserker Potion work by their item index, not their dummy magic', () => {
    expect(effect(2357)).toMatchObject({ steal: 'hp', stats: [] })
    expect(effect(2356)).toMatchObject({ steal: 'mp', stats: [] })
    expect(effect(2853)).toMatchObject({ berserker: true, stats: [] })
    expect(getItem(2357).potion!.duration).toBe(3600)
  })

  it('Blessed Iris doubles EXP for 3 h and the Platinum Super Skill Pill triples SP for 1 h', () => {
    expect(effect(1288).stats).toEqual([])
    expect(getItem(1288).potion!.duration).toBe(10800)
    expect(effectRewardMultipliers([effect(1288)])).toEqual({ exp: 2, sp: 1, gold: 1, drop: 1 })
    expect(effectRewardMultipliers([effect(2453)])).toEqual({ exp: 1, sp: 3, gold: 1, drop: 1 })
    expect(effectRewardMultipliers([effect(1288), effect(2453)])).toEqual({
      exp: 2,
      sp: 3,
      gold: 1,
      drop: 1,
    })
  })

  it('attribute potions add 15 to their attribute for an hour', () => {
    expect(stat(2849, 'strength')).toEqual([
      { kind: 'stat', stat: 'strength', value: 15, percent: false },
    ])
    expect(stat(2850, 'dexterity')[0]!.value).toBe(15)
    expect(stat(2851, 'constitution')[0]!.value).toBe(15)
    expect(stat(2852, 'intelligence')[0]!.value).toBe(15)
  })

  it('shields, Power, Large Attack and the critical potions change their stats', () => {
    expect(stat(2872, 'defense')[0]).toMatchObject({ value: 30, percent: true })
    expect(stat(2871, 'magicDefense')[0]).toMatchObject({ value: 30, percent: true })
    expect(stat(2846, 'attack')[0]).toMatchObject({ value: 100, percent: false })
    expect(stat(2846, 'defense')[0]).toMatchObject({ value: 95, percent: false })
    expect(stat(1315, 'magicAttack')[0]).toMatchObject({ value: 80, percent: false })
    expect(stat(2990, 'critChance')[0]).toMatchObject({ value: 200 })
    expect(stat(2631, 'attack')[0]).toMatchObject({ value: 25, percent: true })
    expect(stat(1575, 'attack')[0]).toMatchObject({ value: 20, percent: true })
  })
})
