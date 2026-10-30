import { describe, expect, it } from 'vitest'
import { heroKey, playerFighter, potionSupply } from './fighters.ts'

const slots = (hp: number | null, mp: number | null, auto = { hp: true, mp: true }) => ({
  hp: { itemId: hp, auto: auto.hp },
  mp: { itemId: mp, auto: auto.mp },
})
const knight = { classId: 'knight' as const, level: 1, potionSlots: slots(43, 484) }
const bag = [
  { itemId: 43, count: 3 }, // Small Healing Potion
  { itemId: 484, count: 2 }, // Small Mana Potion
  { itemId: 490, count: 1 }, // Small HP Recovery Potion
  { itemId: 4, count: 1 }, // a sword
]

describe('potionSupply', () => {
  it('carries the potions of the quick slots into fights, not the rest of the bag', () => {
    expect(potionSupply({ ...knight, inventory: bag }).map((p) => [p.itemId, p.count])).toEqual([
      [43, 3],
      [484, 2],
    ])
    expect(playerFighter({ ...knight, inventory: bag }).potions).toHaveLength(2)
    const regen = { ...knight, potionSlots: slots(490, null), inventory: bag }
    expect(potionSupply(regen).map((p) => p.itemId)).toEqual([490])
  })

  it('leaves out slots whose automatic use is off, empty or used up', () => {
    const hpOff = {
      ...knight,
      inventory: bag,
      potionSlots: slots(43, 484, { hp: false, mp: true }),
    }
    expect(potionSupply(hpOff).map((p) => p.itemId)).toEqual([484])
    const none = { ...knight, inventory: bag.slice(1), potionSlots: slots(43, null) }
    expect(potionSupply(none)).toEqual([])
    expect(potionSupply({ ...knight, inventory: bag, potionSlots: undefined })).toEqual([])
  })

  it('changes the hero key when potions are used up or bought', () => {
    const key = heroKey({ ...knight, inventory: bag })
    expect(heroKey({ ...knight, inventory: bag })).toBe(key)
    expect(heroKey({ ...knight, inventory: [{ itemId: 43, count: 2 }, ...bag.slice(1)] })).not.toBe(
      key,
    )
    const hpOff = slots(43, 484, { hp: false, mp: true })
    expect(heroKey({ ...knight, inventory: bag, potionSlots: hpOff })).not.toBe(key)
  })
})
