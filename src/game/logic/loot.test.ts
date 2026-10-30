import { describe, expect, it } from 'vitest'
import {
  ACCESSORY_DROP_CHANCE,
  accessoryDrops,
  addToInventory,
  lootTable,
  rollDrops,
  stowDrops,
} from './loot.ts'
import { createRng } from './rng.ts'

describe('loot', () => {
  it('rolls every table entry on every kill', () => {
    const drops = rollDrops(
      [
        { itemId: 7, chance: 1 },
        { itemId: 3, chance: 0 },
        { itemId: 5, chance: 0.35 },
      ],
      10_000,
      createRng(42),
    )
    expect(drops[0]).toEqual({ itemId: 5, count: expect.any(Number) })
    expect(drops[0]!.count / 10_000).toBeCloseTo(0.35, 1)
    expect(drops[1]).toEqual({ itemId: 7, count: 10_000 })
    expect(drops).toHaveLength(2)
  })

  it('drops nothing without kills or a loot table', () => {
    expect(rollDrops([{ itemId: 1, chance: 1 }], 0, createRng(1))).toEqual([])
    expect(rollDrops(undefined, 10, createRng(1))).toEqual([])
  })

  it('stacks items per kind without changing the input', () => {
    const bag = [{ itemId: 1, count: 2 }]
    const next = addToInventory(bag, [
      { itemId: 1, count: 3 },
      { itemId: 9, count: 1 },
      { itemId: 4, count: 0 },
    ])
    expect(next).toEqual([
      { itemId: 1, count: 5 },
      { itemId: 9, count: 1 },
    ])
    expect(bag).toEqual([{ itemId: 1, count: 2 }])
  })
})

describe('accessory drops', () => {
  // placeholder data: Blue Stone (172, 1300 gold) and Magical Ring (166, 2000 gold)
  it('give every monster a small chance at a plain accessory, cheaper ones more often', () => {
    const drops = accessoryDrops()
    expect(drops.map((d) => d.itemId)).toEqual([172, 166])
    const total = drops.reduce((sum, d) => sum + d.chance, 0)
    expect(total).toBeCloseTo(ACCESSORY_DROP_CHANCE)
    expect(drops[0]!.chance).toBeGreaterThan(drops[1]!.chance)
    expect(lootTable({ drops: [] })).toEqual(expect.arrayContaining(drops))
  })

  it('come as single pieces with rolled options; the rest stacks in the bag', () => {
    let ids = 0
    const bag = stowDrops(
      { inventory: [{ itemId: 43, count: 2 }], gear: [] },
      [
        { itemId: 43, count: 3 },
        { itemId: 166, count: 2 },
      ],
      createRng(3),
      () => `p${++ids}`,
    )
    expect(bag.inventory).toEqual([{ itemId: 43, count: 5 }])
    expect(bag.gear.map((p) => [p.uid, p.itemId, p.plus])).toEqual([
      ['p1', 166, 0],
      ['p2', 166, 0],
    ])
    for (const piece of bag.gear) expect(piece.options!.length).toBeGreaterThanOrEqual(1)
  })
})
