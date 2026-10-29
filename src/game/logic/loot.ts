/** Drops and the inventory. Pure. */
import type { MonsterDrop } from '../data/types.ts'
import { chance, type Rng } from './rng.ts'

export interface ItemStack {
  itemId: number
  count: number
}

/**
 * Rolls a loot table for `kills` kills: every entry separately on every kill (LC t_npc a_item_N with
 * a_item_percent_N — the server code may add drop-rate rules later). Sorted by item id.
 */
export function rollDrops(
  drops: readonly MonsterDrop[] | undefined,
  kills: number,
  rng: Rng,
): ItemStack[] {
  const counts = new Map<number, number>()
  for (const drop of drops ?? []) {
    let count = 0
    for (let k = 0; k < kills; k++) if (chance(rng, drop.chance)) count++
    if (count > 0) counts.set(drop.itemId, (counts.get(drop.itemId) ?? 0) + count)
  }
  return [...counts]
    .map(([itemId, count]) => ({ itemId, count }))
    .sort((a, b) => a.itemId - b.itemId)
}

/** Adds stacks to an inventory (one stack per item for now; equipment instances come with M5). */
export function addToInventory(
  inventory: readonly ItemStack[],
  items: readonly ItemStack[],
): ItemStack[] {
  const next = inventory.map((s) => ({ ...s }))
  for (const item of items) {
    if (item.count <= 0) continue
    const stack = next.find((s) => s.itemId === item.itemId)
    if (stack) stack.count += item.count
    else next.push({ ...item })
  }
  return next
}
