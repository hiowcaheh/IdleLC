import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ITEMS, OPTIONS } from '../data/items.ts'
import type { ClassId, CombatStats, ItemDef, OptionDef } from '../data/types.ts'
import { classAttributes } from './attributes.ts'
import { clientStatChannels } from './clientStats.ts'
import type { Equipment } from './equipment.ts'
import type { ItemOption } from './options.ts'
import { applyStats } from './skills.ts'

// Explicit asymmetric fixtures make accidentally sharing physical/magic fields observable.
const BLADE = 91001
const ARMOR = 91002
const BOW = 91003
const STAFF = 91004
const gear = (subtype: number, attack: number, magicAttack: number) => ({
  subtype,
  attack,
  magicAttack,
  defense: 0,
  magicDefense: 0,
  classes: ['knight', 'healer'] as ClassId[],
})
const items: ItemDef[] = [
  {
    id: BLADE,
    name: 'Channel blade',
    type: 'weapon',
    level: 1,
    price: 0,
    gear: { ...gear(0, 100, 40), slot: 'weapon' },
  },
  {
    id: ARMOR,
    name: 'Channel armor',
    type: 'armor',
    level: 1,
    price: 0,
    gear: { ...gear(1, 0, 0), slot: 'armor', defense: 80, magicDefense: 30 },
  },
  {
    id: BOW,
    name: 'Channel bow',
    type: 'weapon',
    level: 1,
    price: 0,
    gear: { ...gear(6, 100, 20), slot: 'weapon' },
  },
  {
    id: STAFF,
    name: 'Channel staff',
    type: 'weapon',
    level: 1,
    price: 0,
    gear: { ...gear(12, 100, 100), slot: 'weapon' },
  },
]
const optionTypes = [
  6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 21, 22, 55, 64, 66, 73, 74, 75, 76, 77, 78,
]
const savedItems = new Map<number, ItemDef | undefined>()
const savedOptions = new Map<number, OptionDef | undefined>()

beforeEach(() => {
  for (const item of items) {
    savedItems.set(item.id, ITEMS[item.id])
    ITEMS[item.id] = item
  }
  for (const type of optionTypes) {
    savedOptions.set(type, OPTIONS[type])
    OPTIONS[type] = {
      type,
      name: `Source option ${type}`,
      values: [10, 20],
      weights: [0, 0],
      weaponMask: 0,
      armorMask: 0,
      accessoryMask: 0,
    }
  }
})

afterEach(() => {
  for (const [id, item] of savedItems) {
    if (item) ITEMS[id] = item
    else delete ITEMS[id]
  }
  for (const [id, option] of savedOptions) {
    if (option) OPTIONS[id] = option
    else delete OPTIONS[id]
  }
  savedItems.clear()
  savedOptions.clear()
})

function sheet(
  classId: ClassId,
  equipment: Equipment = {},
  options: ItemOption[] = [],
): CombatStats {
  const stats: CombatStats = {
    maxHp: 1300,
    attack: 9876,
    defense: 5432,
    attackInterval: 1,
    critChance: 0.1,
    critMultiplier: 1.5,
    ...classAttributes(classId, 20),
  }
  return { ...stats, ...clientStatChannels(stats, classId, 20, equipment, options) }
}
const piece = (itemId: number, plus = 0) => ({ uid: `test-${itemId}`, itemId, plus })
const option = (type: number, level = 1): ItemOption => ({ type, level })

describe('source character-window channels', () => {
  it('keeps physical/magic weapon and armor channels independent of the idle balance adapter', () => {
    const stats = sheet('knight', { weapon: piece(BLADE, 5), armor: piece(ARMOR, 5) })
    // CmdMsg.cpp:570–584,687–705: equipment, then level/attribute display terms.
    expect(stats.client).toMatchObject({
      physicalAttack: 200,
      magicAttack: 104,
      physicalDefense: 180,
      magicDefense: 55,
    })
    expect(stats.attack).toBe(9876)
    expect(stats.defense).toBe(5432)
    const unarmed = sheet('knight').client!
    expect(unarmed).toMatchObject({
      physicalAttack: 50,
      magicAttack: 44,
      physicalDefense: 60,
      magicDefense: 10,
    })
    expect(sheet('healer').client!.magicDefense).toBe(20)
  })

  it('routes flat physical and magic options separately, including source defense counter sums', () => {
    const equipment = { weapon: piece(BLADE), armor: piece(ARMOR) }
    const base = sheet('knight', equipment).client!
    const physical = sheet('knight', equipment, [option(6), option(11)]).client!
    expect(physical.physicalAttack - base.physicalAttack).toBe(10)
    expect(physical.physicalDefense - base.physicalDefense).toBe(20)
    expect(physical.magicAttack).toBe(base.magicAttack)
    expect(physical.magicDefense).toBe(base.magicDefense)
    const magic = sheet('knight', equipment, [
      option(16),
      option(17),
      option(18),
      option(19),
    ]).client!
    expect(magic.magicAttack - base.magicAttack).toBe(10)
    expect(magic.magicDefense - base.magicDefense).toBe(10)
    expect(magic.magicHit - base.magicHit).toBe(10)
    expect(magic.magicEvasion - base.magicEvasion).toBe(10)
    expect(magic.physicalAttack).toBe(base.physicalAttack)
    expect(magic.physicalDefense).toBe(base.physicalDefense)
    expect(magic.physicalHit).toBe(base.physicalHit)
    expect(magic.physicalEvasion).toBe(base.physicalEvasion)
  })

  it('bases percentage options on raw prototype gear and base ratings, without compounding flat options or pluses', () => {
    const equipment = { weapon: piece(BLADE, 10), armor: piece(ARMOR, 10) }
    const flat = [option(6, 2), option(16, 2), option(21, 2)]
    const base = sheet('knight', equipment, flat).client!
    const options = [...flat, option(73), option(73), option(74), option(75), option(76)]
    const rated = sheet('knight', equipment, options).client!
    expect(rated.physicalAttack - base.physicalAttack).toBe(20)
    expect(rated.magicAttack - base.magicAttack).toBe(8)
    expect(rated.physicalDefense - base.physicalDefense).toBe(16)
    expect(rated.magicDefense - base.magicDefense).toBe(3)
    expect(rated.physicalHit - base.physicalHit).toBe(16)
    expect(rated.magicHit - base.magicHit).toBe(16)
    expect(sheet('knight', equipment, [...options].reverse()).client).toEqual(rated)
  })

  it('uses DEX for a healer bow, STR for a staff physical line, and independent INT magic ratings', () => {
    const bow = sheet('healer', { weapon: piece(BOW) }).client!
    const staff = sheet('healer', { weapon: piece(STAFF) }).client!
    expect(bow).toMatchObject({
      physicalAttack: 171,
      magicAttack: 70,
      physicalHit: 199,
      magicHit: 169,
      physicalEvasion: 107,
      magicEvasion: 76,
    })
    expect(staff).toMatchObject({
      physicalAttack: 126,
      magicAttack: 150,
      physicalHit: 199,
      magicHit: 169,
      physicalEvasion: 107,
      magicEvasion: 76,
    })
    const bowSpecific = sheet('healer', { weapon: piece(BOW) }, [option(9), option(10, 2)]).client!
    const staffSpecific = sheet('healer', { weapon: piece(STAFF) }, [
      option(9),
      option(10, 2),
    ]).client!
    expect(bowSpecific.physicalHit - bow.physicalHit).toBe(20)
    expect(staffSpecific.physicalHit - staff.physicalHit).toBe(10)
    expect(bowSpecific.magicHit).toBe(169)
    expect(staffSpecific.magicHit).toBe(169)
  })

  it('applies magic-only buffs to magic channels and uses pre-addition percentage bases', () => {
    const before = sheet('healer', { weapon: piece(STAFF), armor: piece(ARMOR) })
    const after = applyStats(before, [
      { kind: 'stat', stat: 'magicAttack', value: 15, percent: false },
      { kind: 'stat', stat: 'magicAttack', value: 10, percent: true },
      { kind: 'stat', stat: 'magicDefense', value: 7, percent: false },
      { kind: 'stat', stat: 'magicHit', value: 20, percent: false },
    ])
    expect(after.client!.magicAttack).toBe(175)
    expect(after.client!.magicDefense).toBe(57)
    expect(after.client!.magicHit).toBe(189)
    expect(after.client!.physicalAttack).toBe(before.client!.physicalAttack)
    expect(after.client!.physicalDefense).toBe(before.client!.physicalDefense)
    expect(after.client!.physicalHit).toBe(before.client!.physicalHit)
    expect(before.client!.magicAttack).toBe(150)
  })

  it('recalculates the appropriate attribute term without treating INT as physical damage', () => {
    const before = sheet('healer', { weapon: piece(BOW) })
    const intelligence = applyStats(before, [
      { kind: 'stat', stat: 'intelligence', value: 15, percent: false },
    ])
    expect(intelligence.client!.magicAttack - before.client!.magicAttack).toBe(10)
    expect(intelligence.client!.physicalAttack).toBe(before.client!.physicalAttack)
    const dexterity = applyStats(before, [
      { kind: 'stat', stat: 'dexterity', value: 15, percent: false },
    ])
    expect(dexterity.client!.physicalAttack - before.client!.physicalAttack).toBe(10)
    expect(dexterity.client!.magicAttack).toBe(before.client!.magicAttack)
    // CmdMsg.cpp:832–847 derives these weights from current DEX, before option rates.
    expect(before.client).toMatchObject({ criticalRating: 141, deadlyRating: 94 })
    expect(dexterity.client).toMatchObject({ criticalRating: 154, deadlyRating: 103 })
    const rated = sheet('healer', { weapon: piece(BOW) }, [option(55), option(66, 2)])
    const ratedDexterity = applyStats(rated, [
      { kind: 'stat', stat: 'dexterity', value: 15, percent: false },
    ])
    expect(ratedDexterity.client).toMatchObject({ criticalRating: 169, deadlyRating: 123 })
  })

  it('shows real run speed in m/s, with multiplicative options followed by decimetre assist powers', () => {
    const before = sheet('healer', {}, [option(64), option(64, 2)])
    expect(before.client!.runSpeed).toBeCloseTo(9.24)
    expect(before.client!.walkSpeed).toBe(1.5)
    const after = applyStats(before, [
      { kind: 'stat', stat: 'runSpeed', value: 10, percent: false },
      { kind: 'stat', stat: 'runSpeed', value: 25, percent: true },
    ])
    expect(after.client!.runSpeed).toBeCloseTo(12.8)
    expect(after.client!.walkSpeed).toBe(1.5)
    expect(after.moveSpeed).toBeCloseTo(82.857142857)
    expect(before.client!.runSpeed).toBeCloseTo(9.24)
  })
})
