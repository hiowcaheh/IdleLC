import { describe, expect, it } from 'vitest'
import { SHOP_SELL_RATE, getItem } from '../data/items.ts'
import { createCharacterData } from './character.ts'
import { applySale, sellPrice, stacksValue } from './shop.ts'

const hero = {
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id', 0),
  gold: 10,
  inventory: [
    { itemId: 1, count: 5 },
    { itemId: 4, count: 1 },
  ],
}

describe('shop', () => {
  it('pays the item price times the shop sell rate, rounded down', () => {
    const price = (id: number) => Math.floor((getItem(id).price * SHOP_SELL_RATE) / 100)
    expect(sellPrice(4)).toBe(price(4))
    expect(stacksValue(hero.inventory)).toBe(5 * price(1) + price(4))
  })

  it('sells part of a stack and removes emptied stacks', () => {
    const sale = applySale(hero, [
      { itemId: 1, count: 2 },
      { itemId: 4, count: 1 },
      { itemId: 1, count: 1 },
    ])
    expect(sale.sold).toEqual([
      { itemId: 1, count: 3 },
      { itemId: 4, count: 1 },
    ])
    expect(sale.gold).toBe(3 * sellPrice(1) + sellPrice(4))
    expect(sale.character.gold).toBe(10 + sale.gold)
    expect(sale.character.inventory).toEqual([{ itemId: 1, count: 2 }])
    expect(hero.inventory[0]!.count).toBe(5) // unchanged input
  })

  it('refuses to sell what the character does not have', () => {
    expect(() => applySale(hero, [{ itemId: 1, count: 6 }])).toThrow('not-enough-items')
    expect(() => applySale(hero, [{ itemId: 99, count: 1 }])).toThrow('not-enough-items')
    expect(() => applySale(hero, [{ itemId: 1, count: 0 }])).toThrow('bad-count')
    expect(() => applySale(hero, [{ itemId: 1, count: 1.5 }])).toThrow('bad-count')
    expect(() => applySale(hero, [])).toThrow('nothing-to-sell')
  })
})
