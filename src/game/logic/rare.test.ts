import { describe, expect, it } from 'vitest'
import { GOLDEN_MAGNIFIER_ID, MAGNIFIER_ID } from '../data/items.ts'
import { createCharacterData, type CharacterData } from './character.ts'
import { applyEquip, applyUnequip, piecePower } from './equipment.ts'
import { applyIdentify, isUnidentified, rollRare } from './rare.ts'
import { createRng, type Rng } from './rng.ts'

// placeholder data: Perion Sword (1845) can get the sets Mighty (1, E, 60%), Razing (7, D, 30%)
// and Destructive (23, C, 10%)
const SWORD = 1845
let ids = 0
const makeId = () => `r${++ids}`
const knight = (over: Partial<CharacterData> = {}): CharacterData => ({
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0),
  level: 80,
  ...over,
})
const fixed =
  (...values: number[]): Rng =>
  () =>
    values.length > 1 ? values.shift()! : values[0]!

describe('rare items', () => {
  it('get one of their sets by the item weights, each option of the set with its chance', () => {
    const counts: Record<number, number> = {}
    const rng = createRng(3)
    for (let k = 0; k < 2000; k++) {
      const { rare, options } = rollRare(SWORD, rng)
      counts[rare] = (counts[rare] ?? 0) + 1
      expect(options[0]).toEqual({ type: 20, level: rare === 23 ? 4 : 3 }) // chance 10 000
    }
    expect(counts[1]! / 2000).toBeCloseTo(0.6, 1)
    expect(counts[7]! / 2000).toBeCloseTo(0.3, 1)
    expect(counts[23]! / 2000).toBeCloseTo(0.1, 1)
  })

  it('identify stacks one glass per piece until the glasses run out', () => {
    const c = knight({
      inventory: [
        { itemId: SWORD, count: 5 },
        { itemId: GOLDEN_MAGNIFIER_ID, count: 3 },
      ],
    })
    const r = applyIdentify(
      c,
      GOLDEN_MAGNIFIER_ID,
      [{ itemId: SWORD, count: 5 }],
      createRng(1),
      makeId,
    )
    expect(r.used).toBe(3)
    expect(r.results.every((x) => x.success)).toBe(true)
    expect(r.character.inventory).toEqual([{ itemId: SWORD, count: 2 }])
    expect(r.character.gear).toHaveLength(3)
    for (const piece of r.character.gear) {
      expect(piece.rare).toBeDefined()
      expect(isUnidentified(piece)).toBe(false)
    }
    expect(() =>
      applyIdentify(r.character, GOLDEN_MAGNIFIER_ID, [{ itemId: SWORD, count: 1 }], createRng(1)),
    ).toThrowError(/no-magnifier/)
  })

  it('a plain glass can fail: the glass is gone, the item stays unidentified', () => {
    const c = knight({
      inventory: [
        { itemId: SWORD, count: 1 },
        { itemId: MAGNIFIER_ID, count: 1 },
      ],
    })
    const r = applyIdentify(c, MAGNIFIER_ID, [{ itemId: SWORD, count: 1 }], fixed(0.99), makeId)
    expect(r.results).toEqual([expect.objectContaining({ success: false })])
    expect(r.character.inventory).toEqual([{ itemId: SWORD, count: 1 }])
    expect(r.character.gear).toEqual([])
  })

  it('can be worn unidentified, identified while worn and then stay single pieces', () => {
    let c = knight({
      inventory: [
        { itemId: SWORD, count: 1 },
        { itemId: GOLDEN_MAGNIFIER_ID, count: 1 },
      ],
    })
    c = applyEquip(c, { itemId: SWORD }, makeId)
    expect(isUnidentified(c.equipment.weapon!)).toBe(true)
    const plain = piecePower(c.equipment.weapon!)

    const r = applyIdentify(c, GOLDEN_MAGNIFIER_ID, [{ slot: 'weapon' }], fixed(0.95), makeId)
    const sword = r.character.equipment.weapon!
    expect(sword.rare).toBe(23) // Destructive: +30 attack
    expect(piecePower(sword)).toBe(plain + 30)

    const off = applyUnequip(r.character, 'weapon')
    expect(off.gear).toEqual([sword]) // identified pieces don't go back into a stack
    expect(off.inventory.some((s) => s.itemId === SWORD)).toBe(false)
  })
})
