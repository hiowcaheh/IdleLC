import { describe, expect, it } from 'vitest'
import { SHOP_SELL_RATE, getItem } from '../data/items.ts'
import { createCharacterData } from './character.ts'
import { createRng } from './rng.ts'
import {
  applyBuy,
  applySale,
  applySellPieces,
  buyPrice,
  sellPrice,
  shopOffer,
  stacksValue,
  tierWindow,
} from './shop.ts'

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

describe('buying', () => {
  // placeholder data: knight tiers — weapon Sentinel Blade (4, level 3), helmet Iron Helm (7, level 2);
  // accessories Blue Stone (172) and Magical Ring (166); the glade shop's goods: stones and potions
  const knight = (over = {}) => ({
    ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0),
    gold: 5000,
    ...over,
  })
  let ids = 0
  const makeId = () => `b${++ids}`

  it('offers the previous, current and next gear tier of every slot', () => {
    const tiers = [5, 9, 13, 17].map((level) => ({ level, items: [level] }))
    const levels = (level: number) => tierWindow(tiers, level).map((t) => t.level)
    expect(levels(1)).toEqual([5])
    expect(levels(5)).toEqual([5, 9])
    expect(levels(10)).toEqual([5, 9, 13])
    expect(levels(30)).toEqual([13, 17])
  })

  it('sells gear of the window, accessories and the zone goods for price × buy rate', () => {
    const offer = shopOffer(knight())
    expect(offer.gear).toEqual([
      { slot: 'weapon', tiers: [{ level: 3, items: [4] }] },
      { slot: 'helmet', tiers: [{ level: 2, items: [7] }] },
    ])
    expect(offer.accessories).toEqual([172, 166])
    // the zone's goods, then the magnifying glasses every shop sells
    expect(offer.goods).toEqual([85, 43, 44, 484, 490, 1838, 1839])
    expect(buyPrice(7)).toBe(200)
    const { character } = applyBuy(knight({ gold: 500 }), 7, 2, createRng(1), makeId)
    expect(character.gold).toBe(100)
    expect(character.inventory).toEqual([{ itemId: 7, count: 2 }])
  })

  it('refuses what is not on offer, too expensive or a bad count', () => {
    const rng = createRng(1)
    expect(() => applyBuy(knight(), 1, 1, rng)).toThrowError(/not-in-shop/)
    expect(() => applyBuy(knight(), 5, 1, rng)).toThrowError(/not-in-shop/) // starter sword
    expect(() => applyBuy(knight({ gold: 150 }), 7, 1, rng)).toThrowError(/not-enough-gold/)
    expect(() => applyBuy(knight(), 7, 0, rng)).toThrowError(/bad-count/)
  })

  it('rolls fresh options on every accessory bought', () => {
    const purchase = applyBuy(knight({ gold: 10000 }), 166, 3, createRng(7), makeId)
    expect(purchase.character.gold).toBe(10000 - 3 * 2000)
    expect(purchase.pieces).toHaveLength(3)
    expect(purchase.character.gear).toEqual(purchase.pieces)
    for (const piece of purchase.pieces) {
      expect(piece.options!.length).toBeGreaterThanOrEqual(1)
      // a ring can only roll the ring options of the placeholder data: Attack and Hit Rate
      for (const o of piece.options!) expect([20, 21]).toContain(o.type)
    }
  })

  it('buys upgraded pieces back at the plain price, many at once', () => {
    const c = knight({
      gear: [
        { uid: 'x', itemId: 4, plus: 7 },
        { uid: 'y', itemId: 4, plus: 0, options: [{ type: 20, level: 2 }] },
        { uid: 'z', itemId: 7, plus: 1 },
      ],
    })
    const sale = applySellPieces(c, ['x', 'y'])
    expect(sale.gold).toBe(96) // 2 × 120 × 40%
    expect(sale.sold).toBe(2)
    expect(sale.character.gear.map((p) => p.uid)).toEqual(['z'])
    expect(() => applySellPieces(c, ['x', 'nope'])).toThrowError(/not-owned/)
    expect(() => applySellPieces(c, [])).toThrowError(/nothing-to-sell/)
  })
})
