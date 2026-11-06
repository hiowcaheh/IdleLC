/**
 * The HP and MP potion quick slots: the player puts one potion in each, and the hero drinks only
 * those in fights and on expeditions (while the slot's automatic use is on).
 */
import { getItem } from '../data/items.ts'
import type { PotionDef } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import type { ItemStack } from './loot.ts'

export type PotionGroup = 'hp' | 'mp'

export interface PotionSlot {
  /** The potion in the slot (it stays there when the last one is drunk), or null. */
  itemId: number | null
  /** The hero drinks it by itself. */
  auto: boolean
  /**
   * The share of HP / MP (in %) the hero drinks it below; unset: the potion's default
   * (DEFAULT_BELOW). 100 means whenever the bar is not full.
   */
  below?: number
}

export type PotionSlots = Record<PotionGroup, PotionSlot>

export const POTION_GROUPS: readonly PotionGroup[] = ['hp', 'mp']

export const EMPTY_POTION_SLOTS: PotionSlots = {
  hp: { itemId: null, auto: true },
  mp: { itemId: null, auto: true },
}

/** Lowest share (%) a slot's slider goes down to, and its step. */
export const BELOW_MIN = 5
export const BELOW_STEP = 5

/**
 * When the hero drinks a potion of a kind by itself (% of the bar): healing below half the HP,
 * mana below 30% MP (own rules, as before the slider), recovery potions whenever the bar is not full.
 */
export const DEFAULT_BELOW: Record<PotionDef['kind'], number> = {
  hp: 50,
  mp: 30,
  hpRegen: 100,
  mpRegen: 100,
  boost: 100,
}

/** A slider share in BELOW_STEP steps between BELOW_MIN and 100, or undefined for none. */
export function cleanBelow(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const stepped = Math.round(value / BELOW_STEP) * BELOW_STEP
  return Math.min(100, Math.max(BELOW_MIN, stepped))
}

/** The share (%) a slot's potion is drunk below: the slider's, else the potion's default. */
export function slotBelow(slot: PotionSlot, group: PotionGroup): number {
  if (slot.below !== undefined) return slot.below
  const kind = slot.itemId === null ? undefined : getItem(slot.itemId).potion?.kind
  return DEFAULT_BELOW[kind ?? group]
}

/** The slot a potion goes in: healing and HP recovery → HP, mana and MP recovery → MP. */
export function potionGroup(kind: PotionDef['kind']): PotionGroup {
  return kind === 'hp' || kind === 'hpRegen' ? 'hp' : 'mp'
}

/** Whether the item is a potion of the group's slot. */
export function fitsSlot(itemId: number, group: PotionGroup): boolean {
  const potion = getItem(itemId).potion
  return potion !== undefined && potion.kind !== 'boost' && potionGroup(potion.kind) === group
}

/** How many of an item the bag holds. */
export function countOwned(inventory: readonly ItemStack[], itemId: number): number {
  return inventory.reduce((n, s) => n + (s.itemId === itemId ? s.count : 0), 0)
}

/**
 * The potion of the group the bag holds most of among those the level allows, or null — what an
 * older save (which drank every potion it had) gets in its slot.
 */
export function fullestPotion(
  inventory: readonly ItemStack[],
  level: number,
  group: PotionGroup,
): number | null {
  let best: { itemId: number; count: number } | null = null
  for (const { itemId } of inventory) {
    if (!fitsSlot(itemId, group) || getItem(itemId).level > level) continue
    const count = countOwned(inventory, itemId)
    if (count > 0 && (!best || count > best.count)) best = { itemId, count }
  }
  return best?.itemId ?? null
}

/** Puts a potion the character owns (or nothing) in a slot and sets its automatic use. */
export function applyPotionSlot(
  character: CharacterData,
  group: PotionGroup,
  slot: PotionSlot,
): CharacterData {
  const { itemId, auto } = slot
  const below = cleanBelow(slot.below)
  if (itemId !== null) {
    if (!fitsSlot(itemId, group)) throw new GameError('wrong-potion', `item ${itemId}`)
    if (countOwned(character.inventory, itemId) <= 0) throw new GameError('not-owned')
  }
  return {
    ...character,
    potionSlots: {
      ...character.potionSlots,
      [group]: { itemId, auto: Boolean(auto), ...(below !== undefined ? { below } : {}) },
    },
  }
}
