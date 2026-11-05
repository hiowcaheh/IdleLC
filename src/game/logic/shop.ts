/**
 * The shop: selling items for their database price and buying gear, accessories, potions and
 * upgrade stones. Pure — the server will run the same checks.
 */
import {
  HEAVEN_STONE_ID,
  ITEMS,
  SHOP_BUY_RATE,
  SHOP_SELL_RATE,
  getItem,
  getRareSet,
  sameItemAppearance,
  shopGear,
  shopItems,
  shopMagnifiers,
  type ShopTier,
} from '../data/items.ts'
import type { ClassId, GearSlot } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, type ItemStack } from './loot.ts'

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

/**
 * Sold in every zone for now (owner's request, 2026-10-30; to be removed): Heaven Stones at their
 * database price (1,000 gold) — otherwise only Juno's merchant has them.
 */
const EVERYWHERE = [HEAVEN_STONE_ID]

/**
 * Boost potions every IdleLC shop offers (owner's requests, 2026-11-05): 2138 Platinum Adrenaline
 * (only Juno's merchant in t_shopitem), 2845 Super Haste Potion and 6916 100 Cooldown Reduction
 * Potion (cash items in the database, own prices) and the own 100% Cast Potion. Potion of Haste
 * comes with the towns' goods (t_shopitem).
 */
const BOOST_GOODS = [2138, 2845, 6916, 90001]

/** Only sets and seals with positive source weights can be obtained after appraisal. */
export function shopRareInfo(itemId: number) {
  const sets = (getItem(itemId).rare ?? []).flatMap(({ set, weight }) => {
    const definition = getRareSet(set)
    return definition && weight > 0 ? [{ definition, weight }] : []
  })
  const grade = sets.length ? Math.min(...sets.map((s) => s.definition.grade)) : null
  const best = sets.filter((s) => s.definition.grade === grade)
  const total = sets.reduce((sum, s) => sum + s.weight, 0)
  return {
    maxSeals: Math.max(
      0,
      ...sets.map((s) => s.definition.options.filter((o) => o.chance > 0).length),
    ),
    grade,
    gradeChance: total ? best.reduce((sum, s) => sum + s.weight, 0) / total : 0,
    meanGrade: total ? sets.reduce((sum, s) => sum + s.definition.grade * s.weight, 0) / total : 5,
    sets: best.map((s) => s.definition),
  }
}

/** One row per item family, offering its source rare variant with the strongest seal pool. */
export function bestShopVariant(itemId: number, classId: ClassId): number {
  const base = getItem(itemId)
  if (!base.gear || !base.rare?.length) return itemId
  const rank = (id: number) => {
    const info = shopRareInfo(id)
    return [info.maxSeals, -(info.grade ?? 5), info.gradeChance, -info.meanGrade, info.sets.length]
  }
  let chosen = itemId
  let score = rank(itemId)
  for (const item of Object.values(ITEMS)) {
    if (
      !item.rare?.length ||
      !sameItemAppearance(itemId, item.id) ||
      item.type !== base.type ||
      item.level !== base.level ||
      item.price !== base.price ||
      item.upgradeable !== base.upgradeable ||
      item.gear?.slot !== base.gear.slot ||
      item.gear.subtype !== base.gear.subtype ||
      item.gear.attack !== base.gear.attack ||
      item.gear.magicAttack !== base.gear.magicAttack ||
      item.gear.defense !== base.gear.defense ||
      item.gear.magicDefense !== base.gear.magicDefense ||
      item.gear.attackInterval !== base.gear.attackInterval ||
      !item.gear.classes.includes(classId)
    )
      continue
    const next = rank(item.id)
    const difference = next.map((value, i) => value - score[i]!).find((value) => value !== 0) ?? 0
    if (difference > 0) {
      chosen = item.id
      score = next
    }
  }
  return chosen
}

export function shopOffer(
  character: Pick<CharacterData, 'classId' | 'level' | 'location'>,
): ShopOffer {
  const byClass = shopGear(character.classId)
  return {
    gear: (Object.entries(byClass) as [GearSlot, ShopTier[]][]).map(([slot, tiers]) => ({
      slot,
      tiers: tierWindow(tiers, character.level).map((tier) => ({
        ...tier,
        items: tier.items.map((id) => bestShopVariant(id, character.classId)),
      })),
    })),
    goods: [
      ...new Set([
        ...shopItems(character.location.zoneId).filter((id) => !getItem(id).gear),
        ...EVERYWHERE,
        ...BOOST_GOODS.filter((id) => ITEMS[id]),
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
    offer.gear.some((g) => g.tiers.some((t) => t.items.includes(itemId)))
  )
}

export interface PurchaseResult {
  character: CharacterData
}

/** The most of one item bought at once. */
export const MAX_BUY = 999

/** Buys from the shop: the items go to the bag. */
export function applyBuy(character: CharacterData, itemId: number, count: number): PurchaseResult {
  if (!Number.isInteger(count) || count < 1 || count > MAX_BUY) {
    throw new GameError('bad-count', `${count}`)
  }
  if (!canBuy(character, itemId)) throw new GameError('not-in-shop', `item ${itemId}`)
  const cost = buyPrice(itemId) * count
  if (character.gold < cost) throw new GameError('not-enough-gold', `${cost}`)
  return {
    character: {
      ...character,
      gold: character.gold - cost,
      inventory: addToInventory(character.inventory, [{ itemId, count }]),
    },
  }
}

/** Group consumables by effect, then order each family from small to large. */
export function sortedShopGoods(ids: readonly number[]): number[] {
  const order = { hp: 0, mp: 1, hpRegen: 2, mpRegen: 3, boost: 4 }
  const key = (id: number) => {
    const item = getItem(id)
    return item.potion
      ? [order[item.potion.kind], item.potion.power, item.potion.duration, item.level, item.price]
      : [item.magnifier ? 6 : 5, item.price, item.level]
  }
  return [...ids].sort((a, b) => {
    const ka = key(a),
      kb = key(b)
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (ka[i] ?? 0) - (kb[i] ?? 0)
      if (d) return d
    }
    return a - b
  })
}
