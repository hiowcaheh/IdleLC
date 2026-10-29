import { describe, expect, it } from 'vitest'
import { HEAVEN_STONE_ID, SMELTING_STONE_ID } from '../data/items.ts'
import type { CombatStats } from '../data/types.ts'
import { createCharacterData, type CharacterData } from './character.ts'
import {
  MAX_PLUS,
  NAKED_ATTACK,
  NAKED_DEFENSE,
  applyEquip,
  applyExchange,
  applyGear,
  applyUnequip,
  applyUpgrade,
  checkWear,
  starterEquipment,
  stonesOwned,
} from './equipment.ts'
import type { Rng } from './rng.ts'

// Placeholder items (src/game/data/items.ts): 4 Sentinel Blade (knight weapon, level 3, attack 14),
// 5 Training Sword (starter, attack 8), 6 Squire Tunic (starter armor, defense 10),
// 7 Iron Helm (level 2, defense 6); the glade shop sells 7, 4 and the Smelting Stone.
let ids = 0
const makeId = () => `p${++ids}`
const knight = (over: Partial<CharacterData> = {}): CharacterData => ({
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0),
  ...over,
})
const always: Rng = () => 0
const never: Rng = () => 0.999

const stats: CombatStats = {
  maxHp: 100,
  attack: 100,
  defense: 100,
  attackInterval: 1.5,
  critChance: 0,
  critMultiplier: 1.5,
}

describe('gear and stats', () => {
  it('new characters wear the free starter set of their class', () => {
    expect(knight().equipment).toMatchObject({
      weapon: { itemId: 5, plus: 0 },
      armor: { itemId: 6, plus: 0 },
    })
    expect(starterEquipment('mage')).toEqual({})
  })

  it('typical gear keeps the level stats, none leaves the naked share, upgrades add', () => {
    const starter = starterEquipment('knight', makeId)
    const typical = applyGear(stats, 'knight', 1, starter)
    expect(typical).toMatchObject({ attack: 100, defense: 100, attackInterval: 1.3 })
    const naked = applyGear(stats, 'knight', 1, {})
    expect(naked).toMatchObject({
      attack: 100 * NAKED_ATTACK,
      defense: 100 * NAKED_DEFENSE,
      attackInterval: 1.5,
    })
    const upgraded = applyGear(stats, 'knight', 1, {
      ...starter,
      weapon: { ...starter.weapon!, plus: 5 },
    })
    // +5 = 150% of the typical weapon: 0.6 + 0.4 × 1.5
    expect(upgraded.attack).toBe(120)
    expect(applyGear(stats, 'knight', 1, undefined)).toBe(stats)
  })

  it('checks class and level before wearing', () => {
    expect(checkWear(knight({ level: 3 }), 4)).toBeNull()
    expect(checkWear(knight(), 4)).toBe('level-too-low')
    expect(checkWear({ classId: 'mage', level: 9 }, 4)).toBe('wrong-class')
    expect(checkWear(knight(), 1)).toBe('not-gear')
  })
})

describe('equip and unequip', () => {
  it('wears an item from the bag and stacks the old plain piece back', () => {
    const before = knight({ level: 3, inventory: [{ itemId: 4, count: 2 }] })
    const after = applyEquip(before, { itemId: 4 }, makeId)
    expect(after.equipment.weapon).toMatchObject({ itemId: 4, plus: 0 })
    expect(after.inventory).toEqual([
      { itemId: 4, count: 1 },
      { itemId: 5, count: 1 },
    ])
    expect(() => applyEquip(knight(), { itemId: 4 }, makeId)).toThrowError(/not-owned/)
    expect(() =>
      applyEquip(knight({ inventory: [{ itemId: 4, count: 1 }] }), { itemId: 4 }, makeId),
    ).toThrowError(/level-too-low/)
  })

  it('keeps upgraded pieces as pieces in the bag', () => {
    const start = knight({ level: 3, inventory: [{ itemId: 4, count: 1 }] })
    const sword = { ...start.equipment.weapon!, plus: 4 }
    const wearing = { ...start, equipment: { ...start.equipment, weapon: sword } }
    const swapped = applyEquip(wearing, { itemId: 4 }, makeId)
    expect(swapped.gear).toEqual([sword])
    const back = applyEquip(swapped, { uid: sword.uid }, makeId)
    expect(back.equipment.weapon).toEqual(sword)
    expect(back.gear).toEqual([])
    expect(back.inventory).toEqual([{ itemId: 4, count: 1 }])
  })

  it('takes a piece off into the bag', () => {
    const off = applyUnequip(knight(), 'armor')
    expect(off.equipment.armor).toBeUndefined()
    expect(off.inventory).toEqual([{ itemId: 6, count: 1 }])
    expect(() => applyUnequip(off, 'armor')).toThrowError(/nothing-equipped/)
  })
})

describe('upgrades', () => {
  const withStones = (plus: number, stones = 3) => {
    const c = knight({ inventory: [{ itemId: HEAVEN_STONE_ID, count: stones }] })
    return { ...c, equipment: { ...c.equipment, weapon: { ...c.equipment.weapon!, plus } } }
  }

  it('spends a stone and adds a plus on success', () => {
    const r = applyUpgrade(withStones(0, 1), 'weapon', always)
    expect(r).toMatchObject({ success: true, plusBefore: 0, plusAfter: 1 })
    expect(r.character.equipment.weapon!.plus).toBe(1)
    expect(r.character.inventory).toEqual([])
  })

  it('a failure keeps the plus below +3 and takes one away from +3 on', () => {
    expect(applyUpgrade(withStones(2), 'weapon', never)).toMatchObject({
      success: false,
      plusAfter: 2,
    })
    expect(applyUpgrade(withStones(5), 'weapon', never).plusAfter).toBe(4)
  })

  it('only Heaven Stones upgrade; 10 Smelting Stones exchange for one', () => {
    const c = withStones(0, 0)
    const smelting = { ...c, inventory: [{ itemId: SMELTING_STONE_ID, count: 25 }] }
    expect(() => applyUpgrade(smelting, 'weapon', always)).toThrowError(/no-stone/)
    const exchanged = applyExchange(smelting, 2)
    expect(exchanged.inventory).toEqual([
      { itemId: SMELTING_STONE_ID, count: 5 },
      { itemId: HEAVEN_STONE_ID, count: 2 },
    ])
    expect(stonesOwned(exchanged)).toBe(2)
    expect(() => applyExchange(exchanged, 1)).toThrowError(/no-stone/)
    expect(() => applyExchange(smelting, 0)).toThrowError(/bad-count/)
    const upgraded = applyUpgrade(exchanged, 'weapon', always).character
    expect(upgraded.inventory).toEqual([
      { itemId: SMELTING_STONE_ID, count: 5 },
      { itemId: HEAVEN_STONE_ID, count: 1 },
    ])
  })

  it('needs a stone, a worn piece and room to grow', () => {
    expect(() => applyUpgrade(withStones(0, 0), 'weapon', always)).toThrowError(/no-stone/)
    expect(() => applyUpgrade(withStones(0), 'helmet', always)).toThrowError(/nothing-equipped/)
    expect(() => applyUpgrade(withStones(MAX_PLUS), 'weapon', always)).toThrowError(/max-plus/)
  })
})

describe('accessories', () => {
  const ring = (uid: string, options = [{ type: 20, level: 3 }]) => ({
    uid,
    itemId: 166,
    plus: 0,
    options,
  })

  it('fill the three accessory slots, then replace the first one', () => {
    let c = knight({ gear: [ring('a'), ring('b'), ring('c'), ring('d')] })
    for (const uid of ['a', 'b', 'c']) c = applyEquip(c, { uid }, makeId)
    expect([
      c.equipment.accessory1?.uid,
      c.equipment.accessory2?.uid,
      c.equipment.accessory3?.uid,
    ]).toEqual(['a', 'b', 'c'])
    c = applyEquip(c, { uid: 'd' }, makeId)
    expect(c.equipment.accessory1?.uid).toBe('d')
    // the replaced accessory keeps its options in the bag
    expect(c.gear).toEqual([ring('a')])
    const chosen = applyEquip(c, { uid: 'a' }, makeId, 'accessory3')
    expect(chosen.equipment.accessory3?.uid).toBe('a')
    expect(() => applyEquip(c, { uid: 'a' }, makeId, 'weapon')).toThrowError(/wrong-slot/)
  })

  it('add their option values to the stats and cannot be upgraded', () => {
    const base = starterEquipment('knight', makeId)
    const plain = applyGear(stats, 'knight', 1, base)
    const withRing = applyGear(stats, 'knight', 1, { ...base, accessory1: ring('r') })
    expect(withRing.attack).toBe(plain.attack + 3) // Attack level 3 = 3
    const c = knight({ inventory: [{ itemId: HEAVEN_STONE_ID, count: 1 }] })
    const wearing = { ...c, equipment: { ...c.equipment, accessory1: ring('r') } }
    expect(() => applyUpgrade(wearing, 'accessory1', always)).toThrowError(/not-upgradeable/)
  })
})
