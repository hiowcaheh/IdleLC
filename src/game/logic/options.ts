/**
 * Item options (LC t_option): which options can appear on a piece (the option's weapon / armor /
 * accessory subtype masks), the level of a rolled option (the a_prob weights) and its value (a_level)
 * are 1:1 from the database. How many options a piece gets and what each one does in IdleLC's combat
 * are our own until the LC server code is available (docs/balance.md). Pure.
 *
 * Rare items get their options from a rare set when they are identified (logic/rare.ts); the special
 * options of those sets (skill cooldown, move speed, HP steal…) only come from there.
 */
import { EQUIP_SLOTS, OPTIONS, getItem, getOption } from '../data/items.ts'
import type { ClassId, EquipSlot, GearDef, OptionDef } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import type { Equipment, GearPiece } from './equipment.ts'
import { isRare } from './rare.ts'
import type { Rng } from './rng.ts'
import type { StatEffect, StatKey } from './skills.ts'

/** An option on a piece: t_option.a_type and its level (1 = the first value). */
export interface ItemOption {
  type: number
  level: number
}

/** Weights of getting 1…5 options on a new accessory (own values). */
export const OPTION_COUNT_WEIGHTS = [40, 30, 18, 9, 3]

/** Most options a piece can have (rare sets aside). */
export const MAX_OPTIONS = 5

/**
 * Seconds of active play (fights on screen, not expeditions) per option a random worn piece gains
 * (owner's rule: weapons and armor never drop with options; using them adds one every 10 minutes).
 */
export const OPTION_PLAY_SECONDS = 600

/** Constitution → max HP per point (own value). */
export const HP_PER_CONSTITUTION = 5

const STRENGTH: ClassId[] = ['titan', 'knight']
const DEXTERITY: ClassId[] = ['healer', 'rogue']
const INTELLIGENCE: ClassId[] = ['mage', 'sorcerer']
const PHYSICAL: ClassId[] = ['titan', 'knight', 'healer', 'rogue']
const MELEE: ClassId[] = ['titan', 'knight', 'rogue']
const RANGED: ClassId[] = ['healer', 'rogue']
const MAGIC: ClassId[] = ['mage', 'sorcerer']

interface OptionEffect {
  stat: StatKey
  /** Classes the option helps; every class when left out. */
  classes?: ClassId[]
  /** Multiplier on the option value. */
  scale?: number
  /** The value is in percent (hit / dodge: percentage points instead of 1/10 %). */
  percent?: boolean
}

/** t_option 49 "Reduced Level Requirement": the piece can be worn this many levels earlier. */
export const LEVEL_OPTION = 49

/**
 * What each t_option type does in IdleLC (one attack stat, one defense stat; hit and evasion in
 * 1/10 % like the skills). Elemental options (26–35) and the special ones have no counterpart yet and
 * never roll.
 */
export const OPTION_EFFECTS: Record<number, OptionEffect> = {
  0: { stat: 'attack', classes: STRENGTH }, // Strength
  1: { stat: 'attack', classes: DEXTERITY }, // Dexterity
  2: { stat: 'attack', classes: INTELLIGENCE }, // Intelligence
  3: { stat: 'maxHp', scale: HP_PER_CONSTITUTION }, // Constitution
  4: { stat: 'maxHp' }, // HP
  5: { stat: 'maxMp' }, // MP
  6: { stat: 'attack', classes: PHYSICAL }, // Physical Attack
  7: { stat: 'attack', classes: MELEE }, // Melee Physical Attack
  8: { stat: 'attack', classes: RANGED }, // Ranged Physical Attack
  9: { stat: 'hit', classes: MELEE }, // Melee Physical Hit Rate
  10: { stat: 'hit', classes: RANGED }, // Ranged Physical Hit Rate
  11: { stat: 'defense' }, // Physical Defense
  12: { stat: 'defense' }, // Melee Physical Defense
  13: { stat: 'defense' }, // Ranged Physical Defense
  14: { stat: 'dodge' }, // Melee Evasion
  15: { stat: 'dodge' }, // Ranged Evasion
  16: { stat: 'attack', classes: MAGIC }, // Magic Attack
  17: { stat: 'hit', classes: MAGIC }, // Magic Hit Rate
  18: { stat: 'defense' }, // Magic Defense
  19: { stat: 'dodge' }, // Magic Evasion
  20: { stat: 'attack' }, // Attack
  21: { stat: 'hit' }, // Hit Rate
  22: { stat: 'defense' }, // Defense
  23: { stat: 'dodge' }, // Evasion
  // special options of the rare sets
  24: { stat: 'mpSteal' }, // MP Steal (%)
  25: { stat: 'hpSteal' }, // HP Steal (%)
  50: { stat: 'hpRegen' }, // HP Regen
  51: { stat: 'mpSteal' }, // MP Absorption (%)
  52: { stat: 'hpSteal' }, // HP Absorption (%)
  55: { stat: 'critChance' }, // Increase Critical Chance (1/10 %)
  56: { stat: 'hpRegen' }, // HP Regen
  57: { stat: 'mpRegen' }, // MP Regen
  58: { stat: 'cooldownReduction' }, // Skill Cool Down Reduction (%)
  59: { stat: 'mpCostReduction' }, // Decrease MP Consumption (%)
  63: { stat: 'dodge', percent: true }, // Block Rate (%)
  64: { stat: 'moveSpeed' }, // Move Speed (%)
  66: { stat: 'critMultiplier' }, // Increase Deadly Chance (% critical damage)
}

/**
 * Options that roll on their own (accessories, play time): the plain t_option stats, not the
 * specials of the rare sets.
 */
const ROLLING_OPTIONS = 23

export function optionValue(option: ItemOption): number {
  return getOption(option.type)?.values[option.level - 1] ?? 0
}

/** Whether the option does something for the class. */
export function optionHelps(option: Pick<ItemOption, 'type'>, classId: ClassId): boolean {
  if (option.type === LEVEL_OPTION) return true
  const effect = OPTION_EFFECTS[option.type]
  return effect !== undefined && (!effect.classes || effect.classes.includes(classId))
}

/**
 * Options that can roll on a piece (t_option masks by the item's subtype, a level with weight > 0)
 * and work in IdleLC.
 */
export function optionsFor(gear: Pick<GearDef, 'slot' | 'subtype'>): OptionDef[] {
  const bit = 1 << gear.subtype
  const mask =
    gear.slot === 'weapon'
      ? 'weaponMask'
      : gear.slot === 'accessory'
        ? 'accessoryMask'
        : 'armorMask'
  return Object.values(OPTIONS).filter(
    (o) =>
      o.type <= ROLLING_OPTIONS &&
      (o[mask] & bit) !== 0 &&
      o.weights.some((w) => w > 0) &&
      OPTION_EFFECTS[o.type] !== undefined,
  )
}

/** Levels a piece's options take off its required level (rare option 49). */
export function levelReduction(options: readonly ItemOption[] | undefined): number {
  return (options ?? [])
    .filter((o) => o.type === LEVEL_OPTION)
    .reduce((sum, o) => sum + optionValue(o), 0)
}

/** Index picked by weight (weights ≥ 0, at least one > 0). */
function pick(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0)
  let roll = rng() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]!)
    if (roll < 0) return i
  }
  return weights.length - 1
}

/** New options for a piece: 1–5 different types, each at a level picked by its t_option weights. */
export function rollOptions(itemId: number, rng: Rng): ItemOption[] {
  const gear = getItem(itemId).gear
  if (!gear) return []
  const pool = optionsFor(gear)
  const count = Math.min(pool.length, pick(OPTION_COUNT_WEIGHTS, rng) + 1)
  const options: ItemOption[] = []
  for (let k = 0; k < count; k++) {
    const def = pool.splice(Math.floor(rng() * pool.length), 1)[0]!
    options.push({ type: def.type, level: pick(def.weights, rng) + 1 })
  }
  return options.sort((a, b) => a.type - b.type)
}

/** Stat changes of a set of options for a class (options of other classes do nothing). */
export function optionEffects(options: readonly ItemOption[], classId: ClassId): StatEffect[] {
  return options.flatMap((option) => {
    const effect = OPTION_EFFECTS[option.type]
    if (!effect || !optionHelps(option, classId)) return []
    return [
      {
        kind: 'stat' as const,
        stat: effect.stat,
        value: optionValue(option) * (effect.scale ?? 1),
        percent: effect.percent ?? false,
      },
    ]
  })
}

/** An option a worn piece gained from play time. */
export interface OptionGain {
  slot: EquipSlot
  itemId: number
  option: ItemOption
}

/** Worn pieces that can still gain an option, with the options they can gain. */
function growable(
  equipment: Equipment,
): { slot: EquipSlot; piece: GearPiece; pool: OptionDef[] }[] {
  return EQUIP_SLOTS.flatMap((slot) => {
    const piece = equipment[slot]
    const gear = piece && getItem(piece.itemId).gear
    if (!piece || !gear || isRare(piece.itemId)) return []
    const owned = piece.options ?? []
    if (owned.length >= MAX_OPTIONS) return []
    const pool = optionsFor(gear).filter((o) => !owned.some((p) => p.type === o.type))
    return pool.length ? [{ slot, piece, pool }] : []
  })
}

/**
 * Adds active play time; every OPTION_PLAY_SECONDS a random worn piece (not a rare item, fewer than
 * MAX_OPTIONS options) gains a random option it does not have, at a level picked by the t_option
 * weights. When no piece can take one, the time waits (at most one option's worth).
 */
export function applyPlayTime(
  character: CharacterData,
  seconds: number,
  rng: Rng,
): { character: CharacterData; gained: OptionGain[] } {
  let progress = character.optionProgress + Math.max(0, seconds)
  let equipment = character.equipment
  const gained: OptionGain[] = []
  while (progress >= OPTION_PLAY_SECONDS) {
    const candidates = growable(equipment)
    if (candidates.length === 0) {
      progress = OPTION_PLAY_SECONDS
      break
    }
    progress -= OPTION_PLAY_SECONDS
    const { slot, piece, pool } = candidates[Math.floor(rng() * candidates.length)]!
    const def = pool[Math.floor(rng() * pool.length)]!
    const option = { type: def.type, level: pick(def.weights, rng) + 1 }
    const options = [...(piece.options ?? []), option].sort((a, b) => a.type - b.type)
    equipment = { ...equipment, [slot]: { ...piece, options } }
    gained.push({ slot, itemId: piece.itemId, option })
  }
  return { character: { ...character, optionProgress: progress, equipment }, gained }
}
