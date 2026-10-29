/**
 * Item options (LC t_option): which options can appear on a piece (the option's weapon / armor /
 * accessory subtype masks), the level of a rolled option (the a_prob weights) and its value (a_level)
 * are 1:1 from the database. How many options a piece gets and what each one does in IdleLC's combat
 * are our own until the LC server code is available (docs/balance.md). Pure.
 */
import { OPTIONS, getItem, getOption } from '../data/items.ts'
import type { ClassId, GearDef, OptionDef } from '../data/types.ts'
import type { Rng } from './rng.ts'
import type { StatEffect, StatKey } from './skills.ts'

/** An option on a piece: t_option.a_type and its level (1 = the first value). */
export interface ItemOption {
  type: number
  level: number
}

/** Weights of getting 1…5 options on a new accessory (own values). */
export const OPTION_COUNT_WEIGHTS = [40, 30, 18, 9, 3]

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
}

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
}

export function optionValue(option: ItemOption): number {
  return getOption(option.type)?.values[option.level - 1] ?? 0
}

/** Whether the option does something for the class. */
export function optionHelps(option: Pick<ItemOption, 'type'>, classId: ClassId): boolean {
  const effect = OPTION_EFFECTS[option.type]
  return effect !== undefined && (!effect.classes || effect.classes.includes(classId))
}

/** Options that can appear on a piece (t_option masks by the item's subtype) and work in IdleLC. */
export function optionsFor(gear: Pick<GearDef, 'slot' | 'subtype'>): OptionDef[] {
  const bit = 1 << gear.subtype
  const mask =
    gear.slot === 'weapon'
      ? 'weaponMask'
      : gear.slot === 'accessory'
        ? 'accessoryMask'
        : 'armorMask'
  return Object.values(OPTIONS).filter(
    (o) => (o[mask] & bit) !== 0 && OPTION_EFFECTS[o.type] !== undefined,
  )
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
        percent: false,
      },
    ]
  })
}
