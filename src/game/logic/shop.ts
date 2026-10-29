/** Selling items to the shop. Pure — the server will run the same checks. */
import { SHOP_SELL_RATE, getItem } from '../data/items.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import type { ItemStack } from './loot.ts'

export interface SaleResult {
  character: CharacterData
  sold: ItemStack[]
  /** Gold paid for the whole sale. */
  gold: number
}

/** What the shop pays for one piece: t_item.a_price × t_shop.a_sell_rate %, rounded down. */
export function sellPrice(itemId: number): number {
  return Math.max(0, Math.floor((getItem(itemId).price * SHOP_SELL_RATE) / 100))
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
