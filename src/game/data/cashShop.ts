/**
 * The item shop paid in Cash (owner's request, 2026-11-07): the client's Cashshop window with HOT,
 * Items, Potions and Packages tabs. Prices come from the database's catalog (t_catalog a_cash,
 * `catalog` = its a_ctid) where it sells the same thing; the others are own and marked `own`.
 * Cash belongs to the account (like in the client), not to one hero.
 */
import { GOLDEN_MAGNIFIER_ID, HEAVEN_STONE_ID } from './items.ts'

export type CashTab = 'hot' | 'items' | 'potions' | 'packages'

export interface CashOffer {
  id: string
  /** What one purchase puts in the bag. */
  items: { itemId: number; count: number }[]
  /** Cash for one purchase. */
  price: number
  tabs: CashTab[]
  /** Packages are named; single items take the item's name. */
  name?: string
  /** t_catalog a_ctid of the source price. */
  catalog?: number
  /** IdleLC's own price or package. */
  own?: true
  tag?: 'hot' | 'new'
}

export const CASH_TABS: { id: CashTab; label: string }[] = [
  { id: 'hot', label: 'HOT' },
  { id: 'items', label: 'Items' },
  { id: 'potions', label: 'Potions' },
  { id: 'packages', label: 'Packages' },
]

const potion = (
  id: string,
  itemId: number,
  price: number,
  extra: Partial<CashOffer> = {},
): CashOffer => ({ id, items: [{ itemId, count: 1 }], price, tabs: ['potions'], ...extra })

export const CASH_OFFERS: readonly CashOffer[] = [
  // the client's HOT list (t_catalog category 20000): adrenaline and the skill pill, with the
  // owner's item-shop potions
  potion('adrenaline', 2138, 2100, { catalog: 241, tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('super-haste', 2845, 1500, { own: true, tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('cooldown', 6916, 2100, { own: true, tabs: ['hot', 'potions'], tag: 'hot' }),
  potion('blessed-iris', 1288, 2100, { catalog: 50, tabs: ['hot', 'potions'] }),
  potion('skill-pill', 2453, 1700, { catalog: 216, tabs: ['hot', 'potions'] }),
  potion('berserker', 2853, 2900, { own: true, tabs: ['hot', 'potions'], tag: 'new' }),
  potion('power', 2846, 2100, { own: true }),
  {
    id: 'hp-steal',
    items: [{ itemId: 2357, count: 10 }],
    price: 2900,
    catalog: 236,
    tabs: ['potions'],
  },
  {
    id: 'mp-steal',
    items: [{ itemId: 2356, count: 10 }],
    price: 2900,
    catalog: 237,
    tabs: ['potions'],
  },
  potion('strength', 2849, 1000, { own: true }),
  potion('dexterity', 2850, 1000, { own: true }),
  potion('constitution', 2851, 1000, { own: true }),
  potion('intelligence', 2852, 1000, { own: true }),
  potion('shield', 2872, 1500, { own: true }),
  potion('magic-shield', 2871, 1500, { own: true }),
  potion('critical-small', 2988, 800, { own: true }),
  potion('critical-medium', 2989, 1500, { own: true }),
  potion('critical-big', 2990, 2900, { own: true }),
  potion('attack-large', 1315, 300, { own: true }),
  potion('defense-large', 1314, 300, { own: true }),
  potion('chocolate-small', 2043, 100, { own: true }),
  potion('chocolate-medium', 2044, 200, { own: true }),
  potion('chocolate-large', 2045, 300, { own: true }),
  potion('chocolate-red', 1226, 500, { own: true }),
  potion('chocolate-white', 1227, 500, { own: true }),
  potion('candle', 1575, 300, { own: true }),
  potion('red-pouch', 2631, 500, { own: true }),
  // items
  {
    id: 'heaven-stone',
    items: [{ itemId: HEAVEN_STONE_ID, count: 1 }],
    price: 300,
    own: true,
    tabs: ['items'],
  },
  {
    id: 'heaven-stone-10',
    items: [{ itemId: HEAVEN_STONE_ID, count: 10 }],
    price: 2700,
    own: true,
    tabs: ['items'],
  },
  {
    id: 'golden-magnifier',
    items: [{ itemId: GOLDEN_MAGNIFIER_ID, count: 1 }],
    price: 500,
    own: true,
    tabs: ['items'],
  },
  // packages
  {
    id: 'proficiency-package',
    name: 'Proficiency Package',
    items: [
      { itemId: 1288, count: 2 },
      { itemId: 2453, count: 5 },
      { itemId: 2138, count: 1 },
    ],
    price: 9900,
    catalog: 372,
    tabs: ['hot', 'packages'],
    tag: 'hot',
  },
  {
    id: 'steal-package',
    name: 'Steal Package',
    items: [
      { itemId: 2357, count: 10 },
      { itemId: 2356, count: 10 },
    ],
    price: 5500,
    own: true,
    tabs: ['packages'],
  },
  {
    id: 'warrior-package',
    name: 'Warrior Package',
    items: [
      { itemId: 2846, count: 1 },
      { itemId: 2853, count: 1 },
      { itemId: 2990, count: 1 },
      { itemId: 2872, count: 1 },
      { itemId: 2871, count: 1 },
    ],
    price: 7900,
    own: true,
    tabs: ['packages'],
    tag: 'new',
  },
  {
    id: 'attribute-package',
    name: 'Attribute Package',
    items: [
      { itemId: 2849, count: 1 },
      { itemId: 2850, count: 1 },
      { itemId: 2851, count: 1 },
      { itemId: 2852, count: 1 },
    ],
    price: 3500,
    own: true,
    tabs: ['packages'],
  },
  {
    id: 'sweets-package',
    name: 'Sweets Package',
    items: [
      { itemId: 2045, count: 10 },
      { itemId: 2631, count: 5 },
    ],
    price: 3900,
    own: true,
    tabs: ['packages'],
  },
]

export const getCashOffer = (id: string): CashOffer | undefined =>
  CASH_OFFERS.find((o) => o.id === id)
