/**
 * The shop: selling items for their database price and buying gear, accessories, potions and
 * upgrade stones. Pure — the server will run the same checks.
 */
import {
  SHOP_BUY_RATE,
  SHOP_SELL_RATE,
  getItem,
  shopAccessories,
  shopGear,
  shopItems,
  shopMagnifiers,
  type ShopTier,
} from '../data/items.ts'
import type { GearSlot } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import type { GearPiece } from './equipment.ts'
import { GameError } from './errors.ts'
import { newId } from './id.ts'
import { addToInventory, type ItemStack } from './loot.ts'
import { rollOptions } from './options.ts'
import type { Rng } from './rng.ts'

export interface SaleResult {
  character: CharacterData
  sold: ItemStack[]
  /** Gold paid for the whole sale. */
  gold: number
}

/**
 * What the shop pays for one piece: t_item.a_price × t_shop.a_sell_rate %, rounded down. Weapons and
 * armor fetch at least 1 gold (owner's rule: the free starter set can be sold too).
 */
export function sellPrice(itemId: number): number {
  const item = getItem(itemId)
  const price = Math.max(0, Math.floor((item.price * SHOP_SELL_RATE) / 100))
  return item.gear ? Math.max(1, price) : price
}

/** What a set of stacks would sell for. */
export function stacksValue(stacks: readonly ItemStack[]): number {
  return stacks.reduce((sum, s) => sum + sellPrice(s.itemId) * s.count, 0)
}

/** Sells the given pieces from the character's inventory. Throws a GameError when it can't. */
export function applySale(character: CharacterData, items: readonly ItemStack[]): SaleResult {
  const wanted = new Map<number, number>()
  for (const { itemId, count } of items) {
    if (!Number.isInteger(count) || count <= 0) throw new GameError('bad-count', `${count}`)
    wanted.set(itemId, (wanted.get(itemId) ?? 0) + count)
  }
  if (wanted.size === 0) throw new GameError('nothing-to-sell')

  const inventory = character.inventory.map((s) => ({ ...s }))
  const sold: ItemStack[] = []
  for (const [itemId, count] of wanted) {
    const stack = inventory.find((s) => s.itemId === itemId)
    if (!stack || stack.count < count) {
      throw new GameError('not-enough-items', `${count}× item ${itemId}`)
    }
    stack.count -= count
    sold.push({ itemId, count })
  }
  const gold = stacksValue(sold)
  return {
    character: {
      ...character,
      gold: character.gold + gold,
      inventory: inventory.filter((s) => s.count > 0),
    },
    sold,
    gold,
  }
}

/**
 * Sells single pieces (upgraded, with options, identified rare items) from the bag; their "+" and
 * options add nothing to the price.
 */
export interface PieceSale {
  character: CharacterData
  gold: number
  /** Pieces sold. */
  sold: number
}

export function applySellPieces(character: CharacterData, uids: readonly string[]): PieceSale {
  const wanted = new Set(uids)
  if (wanted.size === 0) throw new GameError('nothing-to-sell')
  const pieces = character.gear.filter((p) => wanted.has(p.uid))
  if (pieces.length !== wanted.size) throw new GameError('not-owned', 'piece')
  const gold = pieces.reduce((sum, p) => sum + sellPrice(p.itemId), 0)
  return {
    character: {
      ...character,
      gold: character.gold + gold,
      gear: character.gear.filter((p) => !wanted.has(p.uid)),
    },
    gold,
    sold: pieces.length,
  }
}

/** What the shop asks for one piece: t_item.a_price × t_shop.a_buy_rate %. */
export function buyPrice(itemId: number): number {
  return Math.ceil((getItem(itemId).price * SHOP_BUY_RATE) / 100)
}

export interface ShopOffer {
  /** Weapons and armor of the character's class: the previous, current and next tier per slot. */
  gear: { slot: GearSlot; tiers: ShopTier[] }[]
  /** Plain accessories; their options are rolled on purchase. */
  accessories: number[]
  /** Potions and upgrade stones of the zone's NPC shops (t_shopitem), magnifying glasses. */
  goods: number[]
}

/**
 * The tiers of one slot the shop offers at a level: the tier the character is in, the one before
 * and the next one (only the first tier before reaching it).
 */
export function tierWindow(tiers: readonly ShopTier[], level: number): ShopTier[] {
  let current = -1
  tiers.forEach((t, i) => {
    if (t.level <= level) current = i
  })
  return tiers.slice(Math.max(0, current - 1), current + 2)
}

export function shopOffer(
  character: Pick<CharacterData, 'classId' | 'level' | 'location'>,
): ShopOffer {
  const byClass = shopGear(character.classId)
  return {
    gear: (Object.entries(byClass) as [GearSlot, ShopTier[]][]).map(([slot, tiers]) => ({
      slot,
      tiers: tierWindow(tiers, character.level),
    })),
    accessories: shopAccessories(),
    goods: [
      ...new Set([
        ...shopItems(character.location.zoneId).filter((id) => !getItem(id).gear),
        ...shopMagnifiers(),
      ]),
    ],
  }
}

export function canBuy(
  character: Pick<CharacterData, 'classId' | 'level' | 'location'>,
  itemId: number,
): boolean {
  const offer = shopOffer(character)
  return (
    offer.goods.includes(itemId) ||
    offer.accessories.includes(itemId) ||
    offer.gear.some((g) => g.tiers.some((t) => t.items.includes(itemId)))
  )
}

export interface PurchaseResult {
  character: CharacterData
  /** Accessories bought, with the options they came with. */
  pieces: GearPiece[]
}

/** Buys from the shop. Accessories arrive as single pieces with freshly rolled options. */
export function applyBuy(
  character: CharacterData,
  itemId: number,
  count: number,
  rng: Rng,
  makeId: () => string = newId,
): PurchaseResult {
  if (!Number.isInteger(count) || count < 1 || count > 999) {
    throw new GameError('bad-count', `${count}`)
  }
  if (!canBuy(character, itemId)) throw new GameError('not-in-shop', `item ${itemId}`)
  const cost = buyPrice(itemId) * count
  if (character.gold < cost) throw new GameError('not-enough-gold', `${cost}`)
  const paid = { ...character, gold: character.gold - cost }
  if (getItem(itemId).gear?.slot !== 'accessory') {
    return {
      character: { ...paid, inventory: addToInventory(paid.inventory, [{ itemId, count }]) },
      pieces: [],
    }
  }
  const pieces = Array.from({ length: count }, () => ({
    uid: makeId(),
    itemId,
    plus: 0,
    options: rollOptions(itemId, rng),
  }))
  return { character: { ...paid, gear: [...paid.gear, ...pieces] }, pieces }
}
