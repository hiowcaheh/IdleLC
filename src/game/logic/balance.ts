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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Class stats at a given level: base + perLevel × (level − 1), rounded. */
export function statsForLevel(classDef: ClassDef, level: number): CombatStats {
  const lvl = clamp(Math.floor(level), 1, MAX_LEVEL)
  const growth = lvl - 1
  const { base, perLevel } = classDef
  return {
    ...base,
    maxHp: Math.round(base.maxHp + perLevel.maxHp * growth),
    attack: Math.round(base.attack + perLevel.attack * growth),
    defense: Math.round(base.defense + perLevel.defense * growth),
  }
}

/** Expected damage before variance and crits: atk² / (atk + def), at least 1. */
export function baseDamage(attack: number, defense: number): number {
  if (attack <= 0) return 1
  return Math.max(1, (attack * attack) / (attack + Math.max(0, defense)))
}

export function hitChance(attackerLevel: number, defenderLevel: number): number {
  const raw = BASE_HIT_CHANCE + HIT_CHANCE_PER_LEVEL * (attackerLevel - defenderLevel)
  return clamp(raw, MIN_HIT_CHANCE, MAX_HIT_CHANCE)
}

export function regenPerSecond(maxHp: number): number {
  return maxHp * OUT_OF_COMBAT_REGEN
}

export interface AttackRollInput {
  level: number
  stats: CombatStats
}

export interface AttackResult {
  kind: 'miss' | 'hit' | 'crit'
  damage: number
}

export function rollAttack(
  attacker: AttackRollInput,
  defender: AttackRollInput,
  rng: Rng,
): AttackResult {
  if (!chance(rng, hitChance(attacker.level, defender.level))) return { kind: 'miss', damage: 0 }

  const variance = 1 - DAMAGE_VARIANCE + rng() * DAMAGE_VARIANCE * 2
  const crit = chance(rng, attacker.stats.critChance)
  const raw =
    baseDamage(attacker.stats.attack, defender.stats.defense) *
    variance *
    (crit ? attacker.stats.critMultiplier : 1)
  return { kind: crit ? 'crit' : 'hit', damage: Math.max(1, Math.round(raw)) }
}
