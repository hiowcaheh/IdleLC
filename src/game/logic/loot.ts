/** Drops and the inventory. Pure. */
import { UPGRADE_STONE_ID } from '../data/items.ts'
import type { MonsterDef, MonsterDrop } from '../data/types.ts'
import { chance, type Rng } from './rng.ts'

/**
 * Drops every monster has on top of its own table. LC drops Smelting Stones by a server rule that is
 * not in the database; 1% per kill is our own value until the server code is available.
 */
export const GENERAL_DROPS: MonsterDrop[] = [{ itemId: UPGRADE_STONE_ID, chance: 0.01 }]

/** Everything a kill of the monster can drop. */
export function lootTable(monster: Pick<MonsterDef, 'drops'>): MonsterDrop[] {
  return [...(monster.drops ?? []), ...GENERAL_DROPS]
}

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
