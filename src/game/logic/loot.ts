/** Drops and the inventory. Pure. */
import { SMELTING_STONE_ID, getItem, plainAccessories } from '../data/items.ts'
import type { MonsterDef, MonsterDrop } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import type { GearPiece } from './equipment.ts'
import { newId } from './id.ts'
import { rollOptions } from './options.ts'
import { chance, type Rng } from './rng.ts'

/**
 * Drops every monster has on top of its own table. LC drops Smelting Stones by a server rule that is
 * not in the database; 1% per kill is our own value until the server code is available.
 */
export const GENERAL_DROPS: MonsterDrop[] = [{ itemId: SMELTING_STONE_ID, chance: 0.01 }]

/**
 * Chance per kill that a plain accessory drops (own rule — owner's decision: accessories with options
 * come from monsters, not the shop). Split between them by 1 / price: cheaper ones drop more often.
 */
export const ACCESSORY_DROP_CHANCE = 0.005

/** The plain accessories' entries of every loot table. */
export function accessoryDrops(): MonsterDrop[] {
  const ids = plainAccessories()
  const weights = ids.map((id) => 1 / Math.max(1, getItem(id).price))
  const total = weights.reduce((sum, w) => sum + w, 0)
  return ids.map((itemId, i) => ({
    itemId,
    chance: (ACCESSORY_DROP_CHANCE * weights[i]!) / total,
  }))
}

/** Everything a kill of the monster can drop. */
export function lootTable(monster: Pick<MonsterDef, 'drops'>): MonsterDrop[] {
  return [...(monster.drops ?? []), ...GENERAL_DROPS, ...accessoryDrops()]
}

/**
 * Puts drops in the bag: accessories as single pieces with freshly rolled options, everything else
 * in stacks.
 */
export function stowDrops(
  character: Pick<CharacterData, 'inventory' | 'gear'>,
  drops: readonly ItemStack[],
  rng: Rng,
  makeId: () => string = newId,
): Pick<CharacterData, 'inventory' | 'gear'> {
  const stacks: ItemStack[] = []
  const pieces: GearPiece[] = []
  for (const drop of drops) {
    if (getItem(drop.itemId).gear?.slot !== 'accessory') {
      stacks.push(drop)
      continue
    }
    for (let i = 0; i < drop.count; i++) {
      pieces.push({
        uid: makeId(),
        itemId: drop.itemId,
        plus: 0,
        options: rollOptions(drop.itemId, rng),
      })
    }
  }
  return {
    inventory: addToInventory(character.inventory, stacks),
    gear: pieces.length > 0 ? [...character.gear, ...pieces] : [...character.gear],
  }
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

/**
 * Takes stacks out of an inventory — as many of each as there are (none when there are none).
 * Returns the inventory and what was really taken.
 */
export function takeFromInventory(
  inventory: readonly ItemStack[],
  items: readonly ItemStack[],
): { inventory: ItemStack[]; taken: ItemStack[] } {
  const next = inventory.map((s) => ({ ...s }))
  const taken = new Map<number, number>()
  for (const item of items) {
    const stack = next.find((s) => s.itemId === item.itemId)
    const count = Math.min(stack?.count ?? 0, Math.max(0, Math.floor(item.count)))
    if (!stack || count <= 0) continue
    stack.count -= count
    taken.set(item.itemId, (taken.get(item.itemId) ?? 0) + count)
  }
  return {
    inventory: next.filter((s) => s.count > 0),
    taken: [...taken]
      .map(([itemId, count]) => ({ itemId, count }))
      .sort((a, b) => a.itemId - b.itemId),
  }
}
