import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
  lcIcons: (await import('../data/generated/lc-icons.json')).default,
}))

import { MOONSTONES } from '../data/moonstones.ts'
import { ITEMS, itemIcon } from '../data/items.ts'
import { applyMoonstonePlay } from './moonstones.ts'
import { createCharacterData } from './character.ts'
import { createDefaultSave, loadSave } from './save.ts'
import { addToInventory, takeFromInventory } from './loot.ts'
import { applySale } from './shop.ts'

const hero = () => createCharacterData({ name: 'Moon', classId: 'mage' }, 'm', 1000)

describe('original Moonstone statue', () => {
  it('has all five client grades, known source prizes and the source mineral levels', () => {
    expect(MOONSTONES.map((s) => s.itemId)).toEqual([2545, 2546, 723, 2547, 2548])
    expect(MOONSTONES.map((s) => s.rewards.find((r) => r.itemId === 498)!.flag)).toEqual([
      3, 6, 9, 12, 14,
    ])
    for (const stone of MOONSTONES) {
      expect(itemIcon(stone.itemId)).toBeDefined()
      for (const r of stone.rewards) {
        expect(ITEMS[r.itemId]).toBeDefined()
        expect(itemIcon(r.itemId)).toBeDefined()
        expect(ITEMS[r.itemId]!.gear).toBeUndefined()
        expect(r.itemId).not.toBe(19) // no jackpot row in the supplied normal-stone tables
      }
    }
  })

  it('pays both ends of every source reward interval, consuming only the selected stone', () => {
    for (const stone of MOONSTONES) {
      const total = stone.rewards.reduce((n, r) => n + r.weight, 0)
      let start = 0
      for (const r of stone.rewards) {
        for (const roll of [start + 0.5, start + r.weight - 0.5]) {
          const c = {
            ...hero(),
            inventory: [
              { itemId: stone.itemId, count: 1 },
              { itemId: 95014, count: 1 },
            ],
          }
          const played = applyMoonstonePlay(c, stone.itemId, () => roll / total)
          expect(played.prize).toEqual({
            itemId: r.itemId,
            count: r.count,
            ...(r.flag ? { flag: r.flag } : {}),
          })
          expect(played.character.inventory).toContainEqual({ itemId: 95014, count: 1 })
          expect(played.character.inventory.some((s) => s.itemId === stone.itemId)).toBe(false)
          expect(c.inventory[0]!.count).toBe(1)
        }
        start += r.weight
      }
    }
  })

  it('keeps mineral levels separate through stacking, selling and a v16 reload', () => {
    const first = { itemId: 498, count: 3, flag: 3 }
    const second = { itemId: 498, count: 6, flag: 14 }
    const inventory = addToInventory([first], [second, first])
    expect(inventory).toEqual([{ ...first, count: 6 }, second])
    const taken = takeFromInventory(inventory, [{ ...second, count: 1 }])
    expect(taken.taken).toEqual([{ ...second, count: 1 }])
    expect(taken.inventory).toEqual([
      { ...first, count: 6 },
      { ...second, count: 5 },
    ])
    const save = {
      ...createDefaultSave(1000),
      characters: [{ ...hero(), inventory: taken.inventory }],
    }
    const kept = loadSave(JSON.stringify(save), 1000).save.characters[0]!
    expect(kept.inventory).toEqual(taken.inventory)
    const sale = applySale(kept, [{ ...first, count: 2 }])
    expect(sale.sold).toEqual([{ ...first, count: 2 }])
    expect(sale.character.inventory).toEqual([
      { ...first, count: 4 },
      { ...second, count: 5 },
    ])
  })

  it('rejects an unknown or missing stake without changing the bag', () => {
    expect(() => applyMoonstonePlay(hero(), 85, () => 0)).toThrow('not-a-moonstone')
    expect(() => applyMoonstonePlay(hero(), 723, () => 0)).toThrow('not-enough-moonstones')
  })
})
