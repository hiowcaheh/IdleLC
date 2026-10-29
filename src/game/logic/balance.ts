/**
 * All balance formulas live here. Documented in docs/balance.md — keep both in sync.
 */
import { MAX_LEVEL } from '../data/progression.ts'
import type { ClassDef, CombatStats } from '../data/types.ts'
import { chance, type Rng } from './rng.ts'

export { MAX_LEVEL }

/** Hit chance at equal levels, change per level of difference, and its bounds. */
export const BASE_HIT_CHANCE = 0.92
export const HIT_CHANCE_PER_LEVEL = 0.02
export const MIN_HIT_CHANCE = 0.5
export const MAX_HIT_CHANCE = 0.98

/** Damage is multiplied by a uniform roll in [1 - variance, 1 + variance]. */
export const DAMAGE_VARIANCE = 0.1

/** Fraction of max HP regenerated per second while out of combat. */
export const OUT_OF_COMBAT_REGEN = 0.03
/** Fraction of max MP regenerated per second out of combat and during a fight (own values). */
export const OUT_OF_COMBAT_MP_REGEN = 0.02
export const COMBAT_MP_REGEN = 0.005
/** Skill HP/MP regeneration values are per recovery tick of this many seconds (own reading). */
export const REGEN_TICK_SECONDS = 5

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Class stats at a given level: base + perLevel × (level − 1), rounded. */
export function statsForLevel(classDef: ClassDef, level: number): CombatStats {
  const lvl = clamp(Math.floor(level), 1, MAX_LEVEL)
  const growth = lvl - 1
  const { base, perLevel, mana } = classDef
  return {
    ...base,
    maxHp: Math.round(base.maxHp + perLevel.maxHp * growth),
    attack: Math.round(base.attack + perLevel.attack * growth),
    defense: Math.round(base.defense + perLevel.defense * growth),
    maxMp: Math.round(mana.base + mana.perLevel * growth),
  }
}

/** Expected damage before variance and crits: atk² / (atk + def), at least 1. */
export function baseDamage(attack: number, defense: number): number {
  if (attack <= 0) return 1
  return Math.max(1, (attack * attack) / (attack + Math.max(0, defense)))
}

/** `bonus`: attacker's hit minus defender's dodge, in percentage points (skills). */
export function hitChance(attackerLevel: number, defenderLevel: number, bonus = 0): number {
  const raw = BASE_HIT_CHANCE + HIT_CHANCE_PER_LEVEL * (attackerLevel - defenderLevel) + bonus / 100
  return clamp(raw, MIN_HIT_CHANCE, MAX_HIT_CHANCE)
}

export function regenPerSecond(maxHp: number): number {
  return maxHp * OUT_OF_COMBAT_REGEN
}

/** Damage multiplier of a skill hit: t_magiclevel.a_power % on top of a normal hit (own formula). */
export function skillDamageMultiplier(power: number): number {
  return 1 + Math.max(0, power) / 100
}

export interface AttackRollInput {
  level: number
  stats: CombatStats
}

export interface AttackResult {
  kind: 'miss' | 'hit' | 'crit'
  damage: number
}

/** One attack; `multiplier` scales the damage (skills). */
export function rollAttack(
  attacker: AttackRollInput,
  defender: AttackRollInput,
  rng: Rng,
  multiplier = 1,
): AttackResult {
  const bonus = (attacker.stats.hit ?? 0) - (defender.stats.dodge ?? 0)
  if (!chance(rng, hitChance(attacker.level, defender.level, bonus))) {
    return { kind: 'miss', damage: 0 }
  }

  const variance = 1 - DAMAGE_VARIANCE + rng() * DAMAGE_VARIANCE * 2
  const crit = chance(rng, attacker.stats.critChance)
  const raw =
    baseDamage(attacker.stats.attack, defender.stats.defense) *
    variance *
    multiplier *
    (crit ? attacker.stats.critMultiplier : 1)
  return { kind: crit ? 'crit' : 'hit', damage: Math.max(1, Math.round(raw)) }
}
