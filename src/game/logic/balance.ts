/**
 * All balance formulas live here. Documented in docs/balance.md — keep both in sync.
 */
import { MAX_LEVEL } from '../data/progression.ts'
import type { ClassDef, CombatStats } from '../data/types.ts'
import { chance, type Rng } from './rng.ts'
import { ratingHitChance, rollRatings } from './ratings.ts'

export { MAX_LEVEL }

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

/** Raw rating adjustment: PC.cpp:6301–6383 and NPC.cpp:328–355. */
function attackRatings(
  attackerLevel: number,
  defenderLevel: number,
  hit: number,
  avoid: number,
  avoidPerLevel: number,
) {
  const difference = attackerLevel - defenderLevel
  return {
    hit: Math.max(0, hit + difference),
    avoid: Math.max(0, avoid - difference * avoidPerLevel),
  }
}

/** Analytic chance of winning the two integer rating rolls; 100/16 is the placeholder adapter. */
export function hitChance(
  attackerLevel: number,
  defenderLevel: number,
  hit = 100,
  avoid = 16,
  avoidPerLevel = 1,
): number {
  const ratings = attackRatings(attackerLevel, defenderLevel, hit, avoid, avoidPerLevel)
  return ratingHitChance(ratings.hit, ratings.avoid)
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
  skill = false,
): AttackResult {
  const ratings = attackRatings(
    attacker.level,
    defender.level,
    attacker.stats.hit ?? 100,
    defender.stats.dodge ?? 16,
    defender.stats.avoidPerLevel ?? 1,
  )
  if (!rollRatings(ratings.hit, ratings.avoid, rng)) {
    return { kind: 'miss', damage: 0 }
  }

  const variance = 1 - DAMAGE_VARIANCE + rng() * DAMAGE_VARIANCE * 2
  const crit = chance(rng, attacker.stats.critChance)
  const raw =
    baseDamage(attacker.stats.attack, defender.stats.defense) *
    variance *
    multiplier *
    (crit ? attacker.stats.critMultiplier : 1)
  let damage = Math.max(1, Math.round(raw))
  // Battle_GetDamage.cpp:1559–1568: blocking halves normal damage, after integer damage calculation.
  if (
    !skill &&
    (defender.stats.blockChance ?? 0) > 0 &&
    chance(rng, (defender.stats.blockChance ?? 0) / 100)
  ) {
    damage = Math.max(1, Math.trunc(damage / 2))
  }
  return { kind: crit ? 'crit' : 'hit', damage }
}
