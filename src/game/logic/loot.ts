/** Drops and the inventory. Pure. */
import { SMELTING_STONE_ID, getItem, plainAccessories } from '../data/items.ts'
import type { MonsterDef, MonsterDrop } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import type { GearPiece } from './equipment.ts'
import { newId } from './id.ts'
import { rollOptions } from './options.ts'
import { chance, rollInt, type Rng } from './rng.ts'

/**
 * Drops every monster has on top of its own table. The global 1% Smelting Stone chance is an
 * existing IdleLC rule; it shares the solo level gate with the other item drops.
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

/** Battle_NPCDropItem.cpp:79–111. Empty positions remain selectable and duplicates can drop. */
export function rollSourceDrops(
  slots: readonly (MonsterDrop | null)[],
  kills: number,
  rng: Rng,
): ItemStack[] {
  if (slots.length !== 20) throw new Error('A source drop table must preserve all 20 slots')
  const counts = new Map<number, number>()
  for (let kill = 0; kill < kills; kill++)
    for (let attempt = 0; attempt < 4; attempt++) {
      const drop = slots[rollInt(rng, 0, 19)]
      const roll = rollInt(rng, 1, 10000)
      if (drop && roll <= Math.trunc(drop.chance * 10000))
        counts.set(drop.itemId, (counts.get(drop.itemId) ?? 0) + 1)
    }
  return [...counts]
    .map(([itemId, count]) => ({ itemId, count }))
    .sort((a, b) => a.itemId - b.itemId)
}

export function monsterDrops(monster: MonsterDef, kills: number, rng: Rng): ItemStack[] {
  if (!monster.dropSlots) return rollDrops(lootTable(monster), kills, rng)
  return addToInventory(
    rollSourceDrops(monster.dropSlots, kills, rng),
    rollDrops([...GENERAL_DROPS, ...accessoryDrops()], kills, rng),
  )
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
 * Preserved IdleLC entry rolls, once per eligible kill. rewardKills applies the source level gate;
 * the original four attempts over 20 slots are a separate migration. Sorted by item id.
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
