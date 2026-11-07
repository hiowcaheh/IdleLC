/**
 * The item shop paid in Cash (owner's requests, 2026-11-07), in the client's Cashshop look: HOT,
 * SALE, Items, Potions and Packages. Cash belongs to the account (like in the client), not to one
 * hero; 1,000 Cash stand for 1 € (the owner's top-up rate).
 *
 * Prices are own, set to the owner's rules: Cash is cheap and the shop is not pay-to-win. It sells
 * time-limited boosts and conveniences only, no upgrade stones and no gear; a one-hour potion costs
 * a few hundred Cash. Packages save about a third against buying their contents one by one; SALE
 * offers keep their regular price in `was`.
 */
import { GOLDEN_MAGNIFIER_ID, MAGNIFIER_ID } from './items.ts'

export type CashTab = 'hot' | 'sale' | 'items' | 'potions' | 'packages'

export interface CashOffer {
  id: string
  /** What one purchase puts in the bag. */
  items: { itemId: number; count: number }[]
  /** Cash for one purchase. */
  price: number
  tabs: CashTab[]
  /** Packages are named; single items take the item's name. */
  name?: string
  /** On sale: the regular price. */
  was?: number
  tag?: 'hot' | 'new'
}

export const CASH_TABS: { id: CashTab; label: string }[] = [
  { id: 'hot', label: 'HOT' },
  { id: 'sale', label: 'SALE' },
  { id: 'items', label: 'Items' },
  { id: 'potions', label: 'Potions' },
  { id: 'packages', label: 'Packages' },
]

/** 1 € in Cash (the owner's top-up rate). */
export const CASH_PER_EURO = 1000

const potion = (
  id: string,
  itemId: number,
  price: number,
  extra: Partial<CashOffer> = {},
): CashOffer => ({ id, items: [{ itemId, count: 1 }], price, tabs: ['potions'], ...extra })

const pack = (
  id: string,
  name: string,
  price: number,
  items: [number, number][],
  extra: Partial<CashOffer> = {},
): CashOffer => ({
  id,
  name,
  price,
  items: items.map(([itemId, count]) => ({ itemId, count })),
  tabs: ['packages'],
  ...extra,
})

export const CASH_OFFERS: readonly CashOffer[] = [
  // one-hour (Iris: three-hour) boosts
  potion('adrenaline', 2138, 300, { tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('super-haste', 2845, 200, { tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('cooldown', 6916, 400, { tabs: ['hot', 'potions'] }),
  potion('blessed-iris', 1288, 280, { was: 400, tabs: ['hot', 'sale', 'potions'] }),
  potion('skill-pill', 2453, 400, { tabs: ['hot', 'potions'] }),
  potion('berserker', 2853, 300, { was: 400, tabs: ['sale', 'potions'], tag: 'new' }),
  potion('power', 2846, 300),
  {
    id: 'hp-steal',
    items: [{ itemId: 2357, count: 10 }],
    price: 350,
    was: 500,
    tabs: ['sale', 'potions'],
  },
  { id: 'mp-steal', items: [{ itemId: 2356, count: 10 }], price: 500, tabs: ['potions'] },
  potion('strength', 2849, 150),
  potion('dexterity', 2850, 150),
  potion('constitution', 2851, 150),
  potion('intelligence', 2852, 150),
  potion('shield', 2872, 200, { was: 300, tabs: ['sale', 'potions'] }),
  potion('magic-shield', 2871, 300),
  potion('critical-small', 2988, 150),
  potion('critical-medium', 2989, 250),
  potion('critical-big', 2990, 400),
  // five-minute event potions
  potion('attack-large', 1315, 50),
  potion('defense-large', 1314, 50),
  potion('chocolate-small', 2043, 30),
  potion('chocolate-medium', 2044, 50),
  potion('chocolate-large', 2045, 80),
  potion('chocolate-red', 1226, 100),
  potion('chocolate-white', 1227, 100),
  potion('candle', 1575, 60),
  potion('red-pouch', 2631, 100),
  // conveniences
  {
    id: 'golden-magnifier',
    items: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 1 }],
    price: 200,
    tabs: ['items'],
  },
  {
    id: 'magnifier-10',
    items: [{ itemId: MAGNIFIER_ID, count: 10 }],
    price: 300,
    tabs: ['items'],
  },
  {
    id: 'golden-magnifier-10',
    items: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 10 }],
    price: 1500,
    tabs: ['items', 'sale'],
    was: 2000,
  },
  // packages: about a third off their contents
  pack(
    'starter-package',
    'Starter Package',
    900,
    [
      [2138, 1],
      [2845, 1],
      [1288, 1],
      [1315, 5],
      [1314, 5],
    ],
    { tabs: ['hot', 'packages'], tag: 'new' },
  ),
  pack(
    'proficiency-package',
    'Proficiency Package',
    1900,
    [
      [1288, 2],
      [2453, 5],
      [2138, 1],
    ],
    { tabs: ['hot', 'packages'], tag: 'hot' },
  ),
  pack('hunter-package', 'Hunter Package', 2100, [
    [2853, 3],
    [2846, 3],
    [2990, 3],
  ]),
  pack('guardian-package', 'Guardian Package', 1600, [
    [2872, 3],
    [2871, 3],
    [2851, 5],
  ]),
  pack('attribute-package', 'Attribute Package', 1100, [
    [2849, 3],
    [2850, 3],
    [2851, 3],
    [2852, 3],
  ]),
  pack('steal-package', 'Steal Package', 700, [
    [2357, 10],
    [2356, 10],
  ]),
  pack('sweets-package', 'Sweets Package', 950, [
    [2045, 10],
    [2631, 5],
    [1575, 5],
  ]),
]

export const getCashOffer = (id: string): CashOffer | undefined =>
  CASH_OFFERS.find((o) => o.id === id)

/** Regular Cash price of one item: its single offer's price (not the sale price) per piece. */
export function cashUnitPrice(itemId: number): number | undefined {
  const single = CASH_OFFERS.find((o) => o.items.length === 1 && o.items[0]!.itemId === itemId)
  return single ? (single.was ?? single.price) / single.items[0]!.count : undefined
}

/**
 * What the offer's contents cost bought one by one at regular prices: the struck-through price of
 * a package (or of a sale offer, its `was`).
 */
export function cashOfferWorth(offer: CashOffer): number {
  if (offer.was !== undefined) return offer.was
  if (offer.items.length === 1 && offer.items[0]!.count === 1) return offer.price
  return Math.round(
    offer.items.reduce((sum, i) => sum + (cashUnitPrice(i.itemId) ?? 0) * i.count, 0),
  )
}

/** Per cent saved against the regular price (0 when there is no saving). */
export function cashSaving(offer: CashOffer): number {
  const worth = cashOfferWorth(offer)
  return worth > offer.price ? Math.round((1 - offer.price / worth) * 100) : 0
}
