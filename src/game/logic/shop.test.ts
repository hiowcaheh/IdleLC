import { describe, expect, it } from 'vitest'
import { GOLDEN_MAGNIFIER_ID, ITEMS, RARE_SETS, SHOP_SELL_RATE, getItem } from '../data/items.ts'
import type { ItemDef, RareSetDef } from '../data/types.ts'
import { createCharacterData } from './character.ts'
import {
  applyBuy,
  applySale,
  applySellPieces,
  bestShopVariant,
  buyPrice,
  sellPrice,
  shopOffer,
  shopRareInfo,
  stacksValue,
  tierWindow,
  sortedShopGoods,
} from './shop.ts'
import { applyIdentify, rollRare } from './rare.ts'

const hero = {
  ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id', 0),
  gold: 10,
  inventory: [
    { itemId: 1, count: 5 },
    { itemId: 4, count: 1 },
  ],
}

describe('shop', () => {
  it('keeps the full mana family together in size order, before recovery potions', () => {
    const backup485 = ITEMS[485],
      backup724 = ITEMS[724]
    ITEMS[485] = {
      ...getItem(484),
      id: 485,
      name: 'Medium Mana Potion',
      potion: { kind: 'mp', power: 16, duration: 15, cooldown: 5 },
    }
    ITEMS[724] = {
      ...getItem(484),
      id: 724,
      name: 'Great Mana Potion',
      potion: { kind: 'mp', power: 24, duration: 15, cooldown: 5 },
    }
    try {
      expect(sortedShopGoods([490, 724, 485, 44, 484, 43, 85])).toEqual([
        43, 44, 484, 485, 724, 490, 85,
      ])
    } finally {
      if (backup485) ITEMS[485] = backup485
      else delete ITEMS[485]
      if (backup724) ITEMS[724] = backup724
      else delete ITEMS[724]
    }
  })
  it('pays the item price times the shop sell rate, rounded down', () => {
    const price = (id: number) => Math.floor((getItem(id).price * SHOP_SELL_RATE) / 100)
    expect(sellPrice(4)).toBe(price(4))
    expect(stacksValue(hero.inventory)).toBe(5 * price(1) + price(4))
  })

  it('buys weapons and armor for at least 1 gold (the free starter set too)', () => {
    expect(getItem(5).price).toBe(0) // Training Sword, starter weapon
    expect(sellPrice(5)).toBe(1)
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
  // the glade shop's goods: stones and potions
  const knight = (over = {}) => ({
    ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'k', 0),
    gold: 5000,
    ...over,
  })
  it('offers the previous, current and next gear tier of every slot', () => {
    const tiers = [5, 9, 13, 17].map((level) => ({ level, items: [level] }))
    const levels = (level: number) => tierWindow(tiers, level).map((t) => t.level)
    expect(levels(1)).toEqual([5])
    expect(levels(5)).toEqual([5, 9])
    expect(levels(10)).toEqual([5, 9, 13])
    expect(levels(30)).toEqual([13, 17])
  })

  it('sells gear of the window and the zone goods for price × buy rate', () => {
    const offer = shopOffer(knight())
    expect(offer.gear).toEqual([
      { slot: 'weapon', tiers: [{ level: 3, items: [4] }] },
      { slot: 'helmet', tiers: [{ level: 2, items: [7] }] },
    ])
    // the zone's goods, the boost potions and the magnifying glasses every shop sells
    expect(offer.goods).toEqual([85, 43, 44, 484, 490, 2138, 6916, 1838, 1839])
    expect(buyPrice(7)).toBe(200)
    const { character } = applyBuy(knight({ gold: 500 }), 7, 2)
    expect(character.gold).toBe(100)
    expect(character.inventory).toEqual([{ itemId: 7, count: 2 }])
  })

  it('sells Heaven Stones in every zone for now, up to 999 at once', () => {
    const elsewhere = knight({ location: { zoneId: 'nowhere', monsterId: 'x' }, gold: 2_000_000 })
    expect(shopOffer(elsewhere).goods).toContain(85)
    expect(buyPrice(85)).toBe(1000)
    expect(applyBuy(elsewhere, 85, 999).character.inventory).toEqual([{ itemId: 85, count: 999 }])
    expect(() => applyBuy(elsewhere, 85, 1000)).toThrowError(/bad-count/)
  })

  it('refuses what is not on offer, too expensive or a bad count', () => {
    expect(() => applyBuy(knight(), 1, 1)).toThrowError(/not-in-shop/)
    expect(() => applyBuy(knight(), 5, 1)).toThrowError(/not-in-shop/) // starter sword
    // accessories drop from monsters (logic/loot.ts), the shop doesn't sell them
    expect(() => applyBuy(knight({ gold: 10000 }), 166, 1)).toThrowError(/not-in-shop/)
    expect(() => applyBuy(knight({ gold: 150 }), 7, 1)).toThrowError(/not-enough-gold/)
    expect(() => applyBuy(knight(), 7, 0)).toThrowError(/bad-count/)
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

describe('shop rare variants', () => {
  const baseId = 7
  const variantId = 90001
  const lowSet = 90001
  const highSet = 90002
  const unreachableSet = 90003

  /** Same-price armor variants with source-shaped seal pools, isolated from the live data. */
  function withVariants(run: () => void) {
    const itemBackup = { ...ITEMS }
    const setBackup = { ...RARE_SETS }
    const definition: RareSetDef = {
      id: lowSet,
      grade: 4,
      type: 1,
      prefix: 'Sturdy',
      attack: 0,
      defense: 10,
      magic: 0,
      resist: 0,
      options: [12, 11, 18].map((type) => ({ type, level: 1, chance: 10000 })),
    }
    RARE_SETS[lowSet] = definition
    RARE_SETS[highSet] = {
      ...definition,
      id: highSet,
      grade: 0,
      prefix: 'Casting-Up',
      options: [12, 11, 18, 22, 13, 58].map((type, i) => ({
        type,
        level: 5,
        chance: [10000, 10000, 10000, 9000, 8000, 1000][i]!,
      })),
    }
    RARE_SETS[unreachableSet] = {
      ...RARE_SETS[highSet]!,
      id: unreachableSet,
      prefix: 'Unreachable',
      options: [...RARE_SETS[highSet]!.options, { type: 64, level: 5, chance: 10000 }],
    }
    ITEMS[baseId] = { ...getItem(baseId), rare: [{ set: lowSet, weight: 10000 }] }
    ITEMS[variantId] = {
      ...getItem(baseId),
      id: variantId,
      rare: [
        { set: lowSet, weight: 9750 },
        { set: highSet, weight: 250 },
      ],
    }
    try {
      run()
    } finally {
      for (const id of Object.keys(ITEMS)) delete ITEMS[Number(id)]
      Object.assign(ITEMS, itemBackup)
      for (const id of Object.keys(RARE_SETS)) delete RARE_SETS[Number(id)]
      Object.assign(RARE_SETS, setBackup)
    }
  }

  it('offers one stronger rare variant at the same tier and price, bought and appraised normally', () => {
    withVariants(() => {
      const character = { ...hero, gold: 2_000_000 }
      const helmet = shopOffer(character).gear.find((slot) => slot.slot === 'helmet')!
      expect(helmet.tiers).toEqual([{ level: 2, items: [variantId] }])
      expect(buyPrice(variantId)).toBe(buyPrice(baseId))
      expect(() => applyBuy(character, baseId, 1)).toThrowError(/not-in-shop/)
      const bought = applyBuy(character, variantId, 1).character
      expect(bought.gold).toBe(character.gold - buyPrice(baseId))
      expect(bought.gear).toEqual([]) // still unidentified, in a stack
      const stocked = applyBuy(bought, GOLDEN_MAGNIFIER_ID, 1).character
      const rolls = [0, 0.99] // glass succeeds, Grade A set; remaining rolls give all six seals
      const identified = applyIdentify(
        stocked,
        GOLDEN_MAGNIFIER_ID,
        [{ itemId: variantId, count: 1 }],
        () => rolls.shift() ?? 0,
        () => 'shop-rare',
      )
      expect(identified.results[0]!.success).toBe(true)
      expect(identified.character.gear[0]).toMatchObject({ itemId: variantId, rare: highSet })
      expect(identified.character.gear[0]!.options?.map((o) => o.type)).toEqual([
        12, 11, 18, 22, 13, 58,
      ])
      expect(identified.character.inventory.some((s) => s.itemId === variantId)).toBe(false)
      // Better options are possible, without guaranteeing Grade A or all six seals.
      expect(rollRare(variantId, () => 0).rare).toBe(lowSet)
      expect(rollRare(variantId, () => 0.99).options).toHaveLength(3)
      expect(getItem(baseId).rare).toEqual([{ set: lowSet, weight: 10000 }])
    })
  })

  it('rejects unrelated variants and leaves ordinary gear unchanged', () => {
    withVariants(() => {
      const strong = getItem(variantId)
      const different: Partial<ItemDef>[] = [
        { name: 'Different armor' },
        { level: strong.level + 1 },
        { price: strong.price + 1 },
        { type: 'weapon' },
        { upgradeable: !strong.upgradeable },
        { gear: { ...strong.gear!, slot: 'pants' } },
        { gear: { ...strong.gear!, subtype: strong.gear!.subtype + 1 } },
        { gear: { ...strong.gear!, defense: strong.gear!.defense + 1 } },
        { gear: { ...strong.gear!, classes: ['healer'] } },
        { gear: undefined },
      ]
      for (const changed of different) {
        ITEMS[variantId] = { ...strong, ...changed }
        expect(bestShopVariant(baseId, 'knight')).toBe(baseId)
      }
      ITEMS[variantId] = strong
      ITEMS[baseId] = { ...getItem(baseId), rare: undefined }
      expect(bestShopVariant(baseId, 'knight')).toBe(baseId)
    })
  })

  it('does not advertise unreachable sets or seals', () => {
    withVariants(() => {
      ITEMS[variantId] = {
        ...getItem(variantId),
        rare: [
          { set: highSet, weight: 250 },
          { set: unreachableSet, weight: 0 },
          { set: 99999, weight: 10000 },
        ],
      }
      RARE_SETS[highSet]!.options.push({ type: 64, level: 5, chance: 0 })
      const info = shopRareInfo(variantId)
      expect(info.maxSeals).toBe(6)
      expect(info.grade).toBe(0)
      expect(info.sets.map((s) => s.id)).toEqual([highSet])
    })
  })

  it('prefers better remaining grades when the six-seal Grade A chance is equal', () => {
    withVariants(() => {
      RARE_SETS[90004] = { ...RARE_SETS[lowSet]!, id: 90004, grade: 2 }
      ITEMS[90002] = {
        ...getItem(variantId),
        id: 90002,
        name: getItem(baseId).name.toUpperCase(),
        rare: [
          { set: lowSet, weight: 5000 },
          { set: 90004, weight: 4750 },
          { set: highSet, weight: 250 },
        ],
      }
      expect(shopRareInfo(90002).gradeChance).toBe(shopRareInfo(variantId).gradeChance)
      expect(bestShopVariant(baseId, 'knight')).toBe(90002)
    })
  })
})
