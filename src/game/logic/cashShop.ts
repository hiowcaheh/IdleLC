/** Buying from the Cash item shop (data/cashShop.ts). */
import { getCashOffer } from '../data/cashShop.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, type ItemStack } from './loot.ts'

/** Most purchases of one offer at once. */
export const MAX_CASH_PURCHASE = 99

/** Cash of a stored save: a whole, non-negative amount (0 when missing). */
export const sanitizeCash = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0

export function applyCashBuy(
  character: CharacterData,
  cash: number,
  offerId: string,
  count: number,
): { character: CharacterData; cash: number; items: ItemStack[] } {
  const offer = getCashOffer(offerId)
  if (!offer) throw new GameError('unknown-offer')
  if (!Number.isInteger(count) || count < 1 || count > MAX_CASH_PURCHASE)
    throw new GameError('invalid-count')
  const price = offer.price * count
  if (price > cash) throw new GameError('not-enough-cash', 'Not enough Cash.')
  const items = offer.items.map((i) => ({ itemId: i.itemId, count: i.count * count }))
  return {
    character: { ...character, inventory: addToInventory(character.inventory, items) },
    cash: cash - price,
    items,
  }
}
