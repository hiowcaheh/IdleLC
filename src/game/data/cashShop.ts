/**
 * The item shop paid in Cash (owner's requests, 2026-11-07), in the client's Cashshop look: HOT,
 * SALE, Items, Potions and Packages. Cash belongs to the account (like in the client), not to one
 * hero; 1,000 Cash stand for 1 € (the owner's top-up rate).
 *
 * Prices are own, set to the owner's rules: Cash is cheap and the shop is not pay-to-win. It sells
 * time-limited boosts and conveniences only, no upgrade stones and no gear; a one-hour potion costs
 * 30 to 80 Cash (owner, 2026-11-07: all prices a fifth of the first ones). Packages save about a third against buying their contents one by one; SALE
 * offers keep their regular price in `was`.
 */
import { DUNGEON_SCROLLS } from './dungeonScrolls.ts'
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
  {
    id: 'lacaball-token-100',
    items: [{ itemId: 5123, count: 100 }],
    price: 1000,
    tabs: ['hot', 'items'],
    tag: 'new',
  },
  {
    id: 'lacaball-gold-token-50',
    items: [{ itemId: 5124, count: 50 }],
    price: 750,
    tabs: ['hot', 'items'],
    tag: 'new',
  },
  // one-hour (Iris: three-hour) boosts
  potion('adrenaline', 2138, 60, { tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('super-haste', 2845, 40, { tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('cooldown', 6916, 80, { tabs: ['hot', 'potions'] }),
  potion('blessed-iris', 1288, 56, { was: 80, tabs: ['hot', 'sale', 'potions'] }),
  potion('skill-pill', 2453, 80, { tabs: ['hot', 'potions'] }),
  potion('berserker', 2853, 60, { was: 80, tabs: ['sale', 'potions'], tag: 'new' }),
  potion('power', 2846, 60),
  {
    id: 'hp-steal',
    items: [{ itemId: 2357, count: 10 }],
    price: 70,
    was: 100,
    tabs: ['sale', 'potions'],
  },
  { id: 'mp-steal', items: [{ itemId: 2356, count: 10 }], price: 100, tabs: ['potions'] },
  potion('strength', 2849, 30),
  potion('dexterity', 2850, 30),
  potion('constitution', 2851, 30),
  potion('intelligence', 2852, 30),
  potion('shield', 2872, 40, { was: 60, tabs: ['sale', 'potions'] }),
  potion('magic-shield', 2871, 60),
  potion('critical-small', 2988, 30),
  potion('critical-medium', 2989, 50),
  potion('critical-big', 2990, 80),
  // five-minute event potions
  potion('attack-large', 1315, 10),
  potion('defense-large', 1314, 10),
  potion('chocolate-small', 2043, 6),
  potion('chocolate-medium', 2044, 10),
  potion('chocolate-large', 2045, 16),
  potion('chocolate-red', 1226, 20),
  potion('chocolate-white', 1227, 20),
  potion('candle', 1575, 12),
  potion('red-pouch', 2631, 20),
  // conveniences
  {
    id: 'golden-magnifier',
    items: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 1 }],
    price: 40,
    tabs: ['items'],
  },
  {
    id: 'magnifier-10',
    items: [{ itemId: MAGNIFIER_ID, count: 10 }],
    price: 60,
    tabs: ['items'],
  },
  {
    id: 'golden-magnifier-10',
    items: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 10 }],
    price: 300,
    tabs: ['items', 'sale'],
    was: 400,
  },
  // one more dungeon entry today (data/dungeonScrolls.ts)
  ...(Object.entries(DUNGEON_SCROLLS) as [string, number][]).map(
    ([dungeon, itemId]): CashOffer => ({
      id: `${dungeon}-scroll`,
      items: [{ itemId, count: 1 }],
      price: 40,
      tabs: ['hot', 'items'],
      tag: 'new',
    }),
  ),
  // packages: about a third off their contents
  pack(
    'starter-package',
    'Starter Package',
    180,
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
    380,
    [
      [1288, 2],
      [2453, 5],
      [2138, 1],
    ],
    { tabs: ['hot', 'packages'], tag: 'hot' },
  ),
  pack('hunter-package', 'Hunter Package', 420, [
    [2853, 3],
    [2846, 3],
    [2990, 3],
  ]),
  pack('guardian-package', 'Guardian Package', 320, [
    [2872, 3],
    [2871, 3],
    [2851, 5],
  ]),
  pack('attribute-package', 'Attribute Package', 220, [
    [2849, 3],
    [2850, 3],
    [2851, 3],
    [2852, 3],
  ]),
  pack('steal-package', 'Steal Package', 140, [
    [2357, 10],
    [2356, 10],
  ]),
  pack('sweets-package', 'Sweets Package', 190, [
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
