import { describe, expect, it } from 'vitest'
import { heroKey, playerFighter, potionSupply } from './fighters.ts'

const knight = { classId: 'knight' as const, level: 1 }
const bag = [
  { itemId: 43, count: 3 }, // Small Healing Potion
  { itemId: 484, count: 2 }, // Small Mana Potion
  { itemId: 490, count: 1 }, // Small HP Recovery Potion
  { itemId: 4, count: 1 }, // a sword
]

describe('potionSupply', () => {
  it('carries the potions of the bag into fights', () => {
    expect(potionSupply({ ...knight, inventory: bag }).map((p) => [p.itemId, p.count])).toEqual([
      [43, 3],
      [484, 2],
      [490, 1],
    ])
    expect(playerFighter({ ...knight, inventory: bag }).potions).toHaveLength(3)
  })

  it('leaves out the kinds whose automatic use is off', () => {
    const hpOff = potionSupply({ ...knight, inventory: bag, potionAuto: { hp: false, mp: true } })
    expect(hpOff.map((p) => p.itemId)).toEqual([484])
    const mpOff = potionSupply({ ...knight, inventory: bag, potionAuto: { hp: true, mp: false } })
    expect(mpOff.map((p) => p.itemId)).toEqual([43, 490])
  })

  it('changes the hero key when potions are used up or bought', () => {
    const key = heroKey({ ...knight, inventory: bag })
    expect(heroKey({ ...knight, inventory: bag })).toBe(key)
    expect(heroKey({ ...knight, inventory: [{ itemId: 43, count: 2 }, ...bag.slice(1)] })).not.toBe(
      key,
    )
    expect(heroKey({ ...knight, inventory: bag, potionAuto: { hp: false, mp: true } })).not.toBe(
      key,
    )
  })
})
