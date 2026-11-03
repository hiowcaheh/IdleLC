import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ITEMS, RARE_SETS } from '../data/items.ts'
import type { ItemDef } from '../data/types.ts'
import { applyGear } from './equipment.ts'
import { pieceStats, upgradedValue, upgradeBonuses } from './itemUpgrades.ts'
import { gearStats } from '../../ui/gear/format.ts'

const original = new Map<number, ItemDef | undefined>()
const weapon = 98001,
  staff = 98002,
  armor = 98003,
  shield = 98004
beforeEach(() => {
  for (const [id, slot, subtype] of [
    [weapon, 'weapon', 0],
    [staff, 'weapon', 2],
    [armor, 'armor', 1],
    [shield, 'shield', 4],
  ] as const) {
    original.set(id, ITEMS[id])
    ITEMS[id] = {
      id,
      name: 'Source upgrade fixture',
      type: slot === 'weapon' ? 'weapon' : 'armor',
      level: 72,
      price: 100,
      upgradeable: true,
      gear: {
        slot,
        subtype,
        classes: ['knight', 'mage'],
        attack: slot === 'weapon' ? 100 : 0,
        magicAttack: id === staff ? 100 : 0,
        defense: slot === 'weapon' ? 0 : 80,
        magicDefense: slot === 'weapon' ? 0 : 30,
      },
    }
  }
})
afterEach(() => {
  for (const [id, value] of original) {
    if (value) ITEMS[id] = value
    else delete ITEMS[id]
  }
  original.clear()
})
const piece = (itemId: number, plus: number) => ({ uid: String(itemId), itemId, plus })

describe('original upgrade values', () => {
  it.each([
    [0, 100],
    [5, 133],
    [10, 179],
    [11, 210],
    [14, 257],
    [15, 275],
  ])('scales 100 at +%i to %i using the source curve and truncation', (plus, value) => {
    expect(upgradedValue(100, plus, 72)).toBe(value)
  })
  it('adds the separate +6 and +15 bonuses to the correct weapon channel', () => {
    expect(pieceStats(piece(weapon, 5)).total.attack).toBe(133)
    expect(pieceStats(piece(weapon, 6)).total.attack).toBe(147)
    expect(pieceStats(piece(weapon, 14)).total.attack).toBe(263)
    expect(pieceStats(piece(weapon, 15)).total.attack).toBe(356)
    expect(pieceStats(piece(staff, 15)).total.magicAttack).toBe(329)
    expect(upgradeBonuses(piece(weapon, 15)).magicAttack).toBe(0)
    expect(upgradeBonuses(piece(staff, 15)).attack).toBe(0)
  })
  it('applies armor thresholds and the shield exception without multiplying the +15 flat bonus', () => {
    expect(pieceStats(piece(armor, 8)).total).toMatchObject({ defense: 137, magicDefense: 47 })
    expect(pieceStats(piece(armor, 15)).total).toMatchObject({ defense: 330, magicDefense: 142 })
    expect(pieceStats(piece(shield, 15)).total).toMatchObject({ defense: 320, magicDefense: 132 })
  })
  it('scales rare weapon bases and keeps rare armor defense outside the power', () => {
    const rare = Object.values(RARE_SETS).find((s) => s.attack > 0)!
    const w = pieceStats({ ...piece(weapon, 15), rare: rare.id })
    expect(w.scaled.attack).toBe(Math.trunc((100 + rare.attack) * 1.07 ** 15))
    const old = RARE_SETS[rare.id]
    RARE_SETS[rare.id] = { ...rare, defense: 20, resist: 10 }
    try {
      const a = pieceStats({ ...piece(armor, 15), rare: rare.id })
      expect(a.scaled.defense).toBe(240)
      expect(a.scaled.magicDefense).toBe(92)
    } finally {
      RARE_SETS[rare.id] = old!
    }
  })
  it('adds exactly the raw source increment to the combat adapter, independently of its level scale', () => {
    const stats = {
      maxHp: 100,
      attack: 9000,
      defense: 3000,
      attackInterval: 1,
      critChance: 0,
      critMultiplier: 1.5,
    }
    const equip = { weapon: piece(weapon, 0), armor: piece(armor, 0) }
    const base = applyGear(stats, 'knight', 72, equip)
    const upgraded = applyGear(stats, 'knight', 72, {
      weapon: piece(weapon, 15),
      armor: piece(armor, 15),
    })
    expect(upgraded.attack - base.attack).toBe(256)
    expect(upgraded.defense - base.defense).toBe(250)
  })
  it('keeps the +15 tooltip bonus separate from the exponential increment', () => {
    expect(gearStats(weapon, 15)).toContainEqual(['Attack', '100 (+175)'])
    expect(gearStats(weapon, 15)).toContainEqual(['Additional attack', '+75'])
    expect(gearStats(staff, 15)).toContainEqual(['Additional magic attack', '+50'])
    expect(gearStats(armor, 15)).toContainEqual(['Additional defense', '+100'])
    expect(gearStats(armor, 14).some(([name]) => name.startsWith('Additional'))).toBe(false)
  })
})
