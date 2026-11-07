/** Opening boxes (data/boxes.ts): each one gives one prize, chosen by weight. */
import { BOX_PRIZES } from '../data/boxes.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, takeFromInventory, type ItemStack } from './loot.ts'
import type { Rng } from './rng.ts'

/** Most boxes opened at once (one tap on "Open all"). */
export const MAX_BOXES_AT_ONCE = 999

export function rollBoxPrize(itemId: number, rng: Rng): ItemStack {
  const prizes = BOX_PRIZES[itemId]
  if (!prizes?.length) throw new GameError('not-a-box')
  const total = prizes.reduce((sum, p) => sum + p.weight, 0)
  let roll = rng() * total
  for (const prize of prizes) {
    roll -= prize.weight
    if (roll < 0) return { itemId: prize.itemId, count: prize.count }
  }
  const last = prizes[prizes.length - 1]!
  return { itemId: last.itemId, count: last.count }
}

/** Opens `count` boxes of the kind from the bag; the prizes go to the bag, summed by item. */
export function applyOpenBoxes(
  character: CharacterData,
  itemId: number,
  count: number,
  rng: Rng,
): { character: CharacterData; prizes: ItemStack[] } {
  if (!BOX_PRIZES[itemId]) throw new GameError('not-a-box')
  if (!Number.isInteger(count) || count < 1 || count > MAX_BOXES_AT_ONCE)
    throw new GameError('invalid-count')
  const owned = character.inventory.find((s) => s.itemId === itemId)?.count ?? 0
  if (owned < count) throw new GameError('not-enough-items', 'Not enough boxes.')
  const summed = new Map<number, number>()
  for (let i = 0; i < count; i++) {
    const prize = rollBoxPrize(itemId, rng)
    summed.set(prize.itemId, (summed.get(prize.itemId) ?? 0) + prize.count)
  }
  const prizes = [...summed].map(([id, n]) => ({ itemId: id, count: n }))
  const { inventory } = takeFromInventory(character.inventory, [{ itemId, count }])
  return {
    character: { ...character, inventory: addToInventory(inventory, prizes) },
    prizes,
  }
}
