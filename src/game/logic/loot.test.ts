import { describe, expect, it } from 'vitest'
import { addToInventory, rollDrops } from './loot.ts'
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
