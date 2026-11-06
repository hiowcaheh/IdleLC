/**
 * All balance formulas live here. Documented in docs/balance.md — keep both in sync.
 */
import { MAX_LEVEL } from '../data/progression.ts'
import type { ClassDef, CombatStats } from '../data/types.ts'
import { chance, type Rng } from './rng.ts'
import { ratingHitChance, rollRatings } from './ratings.ts'
import {
  HIT_MULTIPLIER,
  selectSourceHit,
  sourceHitWeights,
  type SourceHitType,
} from './sourceHitTypes.ts'

export { MAX_LEVEL }

/** Damage is multiplied by a uniform roll in [1 - variance, 1 + variance]. */
export const DAMAGE_VARIANCE = 0.1

/** Fraction of max HP regenerated per second while out of combat. */
export const OUT_OF_COMBAT_REGEN = 0.03
/** Fraction of max MP regenerated per second out of combat and during a fight (own values). */
export const OUT_OF_COMBAT_MP_REGEN = 0.02
export const COMBAT_MP_REGEN = 0.005
/** Config.h: PC_RECOVER_PULSE = PULSE_REAL_SEC * 3. Assist ticks remain separate. */
export const REGEN_TICK_SECONDS = 3

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
  kind: 'miss' | 'hit' | 'crit' | 'deadly'
  damage: number
}

export interface DamagePower {
  power: number
  type: number
}

/** The hit type's share of the attack, in GetDamage's integer arithmetic (A × 8 / 10 …). */
const HIT_SHARE: Record<SourceHitType, readonly [number, number]> = {
  weak: [8, 10],
  normal: [1, 1],
  strong: [13, 10],
  hard: [15, 10],
  critical: [20, 10],
  deadly: [25, 10],
}
const share = (attack: number, hitType: SourceHitType) =>
  Math.trunc((attack * HIT_SHARE[hitType][0]) / HIT_SHARE[hitType][1])

/** Battle_GetDamage.cpp:904–911: an attacker whose weapon is 5+ levels above it hits weaker. */
export function attackLevelPenalty(attack: number, levelsAbove: number): number {
  if (levelsAbove >= 13) return Math.trunc(attack / 10)
  if (levelsAbove >= 9) return Math.trunc((attack * 3) / 10)
  if (levelsAbove >= 5) return Math.trunc(attack / 2)
  return attack
}

/** Battle_GetDamage.cpp:913–926: armor 6+ levels above its wearer defends less. */
export function defenseLevelPenalty(defense: number, levelsAbove: number): number {
  if (levelsAbove >= 16) return Math.trunc(defense / 10)
  if (levelsAbove >= 11) return Math.trunc((defense * 3) / 10)
  if (levelsAbove >= 6) return Math.trunc(defense / 2)
  return defense
}

/**
 * A monster's hit on a hero, GetDamage's NPC branch (Battle_GetDamage.cpp:569–581,816–1004,
 * 1230–1444): the NPC's STR (melee) / DEX (range) / INT (magic) × 10 / 15, plus its attack scaled
 * by the hit type, minus the hero's defense / 3.5 (magic: minus the whole resist). The hero's
 * defense is its gear and options plus 3 × level (resist: level / 2, CCharacter's getter), both
 * weakened when the armor is far above the hero's level. No ±10% roll; at least 1.
 */
export function npcDamage(
  attacker: AttackRollInput,
  defender: AttackRollInput,
  effect?: DamagePower,
  hitType: SourceHitType = 'normal',
): number | null {
  const a = attacker.stats,
    d = defender.stats,
    channels = d.defenseChannels
  if (
    a.clientContext ||
    !channels ||
    a.strength === undefined ||
    a.dexterity === undefined ||
    a.intelligence === undefined
  )
    return null
  const type = a.attackType ?? 'melee'
  const magic = type === 'magic'
  let attack = magic ? (a.magicAttack ?? a.attack) : (a.physicalAttack ?? a.attack)
  attack = attackLevelPenalty(attack, (a.gearLevels?.attack ?? 0) - attacker.level)
  // MDT_ADDITION (Battle_GetDamage.cpp:860–864); a lone MDT_RATE does not scale the attack
  if (effect?.type === 1)
    attack = Math.trunc((attack * (100 + attacker.level)) / 100 + Math.max(1, effect.power))
  const below = (d.gearLevels?.defense ?? 0) - defender.level
  if (magic) {
    const resist =
      defenseLevelPenalty(channels.magic, below) +
      defenseLevelPenalty(Math.trunc(defender.level / 2), below)
    return Math.max(1, Math.trunc((a.intelligence * 10) / 15) + (share(attack, hitType) - resist))
  }
  const defense =
    defenseLevelPenalty(type === 'ranged' ? channels.range : channels.melee, below) +
    defenseLevelPenalty(defender.level * 3, below)
  const stat = type === 'ranged' ? a.dexterity : a.strength
  return Math.max(
    1,
    Math.trunc(Math.trunc((stat * 10) / 15) + share(attack, hitType) - defense / 3.5),
  )
}

/** Solo, unpromoted PC branches of Battle_GetDamage.cpp:608–650,863–903,1288–1330. */
export function sourceSkillDamage(
  attacker: AttackRollInput,
  defender: AttackRollInput,
  effect?: DamagePower,
  hitType: SourceHitType = 'normal',
): number {
  const a = attacker.stats,
    d = defender.stats,
    context = a.clientContext
  const power = Math.max(1, effect?.power ?? 0)
  if (effect?.type === 0) return power
  const fromNpc = npcDamage(attacker, defender, effect, hitType)
  if (fromNpc !== null) return fromNpc
  if (!context || !a.client) {
    // Synthetic fighters have no equipment/attribute split. Preserve that explicit test adapter.
    const attack =
      effect === undefined
        ? a.attack
        : effect.type === 1
          ? a.attack + power
          : Math.trunc((a.attack * power) / 100)
    return Math.max(1, Math.trunc(baseDamage(attack, d.defense)))
  }
  const magic = a.attackType === 'magic'
  const attribute = magic ? (a.intelligence ?? 0) : (a[context.physicalAttribute] ?? 0)
  const attributePart = Math.trunc((attribute * 10) / 15)
  const channel = magic ? a.client.magicAttack : a.client.physicalAttack
  let weapon = channel - attributePart
  if (effect?.type === 1) weapon = Math.trunc((weapon * (100 + attacker.level)) / 100) + power
  // The source RATE path has no ADDITION branch; it does not multiply a normal hit.
  const ratings = attackRatings(
    attacker.level,
    defender.level,
    a.hit ?? 0,
    (magic ? d.magicEvasion : d.dodge) ?? d.dodge ?? 0,
    d.avoidPerLevel ?? 1,
  )
  const hit = ratings.hit,
    avoid = ratings.avoid
  if (hit + avoid > 0) weapon = Math.trunc(weapon * (1 + hit / (hit + avoid)))
  // a monster's own armor level against its level (Battle_GetDamage.cpp:913–926)
  const defense = d.clientContext
    ? magic
      ? (d.magicDefense ?? d.defense)
      : d.defense
    : defenseLevelPenalty(
        magic ? (d.magicDefense ?? d.defense) : d.defense,
        (d.gearLevels?.defense ?? 0) - defender.level,
      )
  const contribution = magic
    ? attributePart
    : Math.trunc((attribute * 10) / (['titan', 'knight'].includes(context.classId) ? 20 : 15))
  const damage = Math.trunc(
    contribution +
      Math.trunc(weapon * HIT_MULTIPLIER[hitType]) -
      defense / (magic ? 1 : d.clientContext ? 3.5 : 5),
  )
  return Math.max(1, Math.trunc(attribute / 3), damage)
}

/** nAttrTbl, Battle_GetDamage.cpp:12–22: attack element (row) against defense element (column). */
const ELEMENT_TABLE: readonly (readonly number[])[] = [
  /* none  */ [1.0, 0.7, 0.7, 0.7, 0.7, 0.8, 0.8],
  /* fire  */ [1.3, 1.0, 0.8, 1.2, 1.0, 1.1, 0.9],
  /* water */ [1.3, 1.2, 1.0, 1.0, 0.8, 1.1, 0.9],
  /* earth */ [1.3, 0.8, 1.0, 1.0, 1.2, 1.1, 0.9],
  /* wind  */ [1.3, 1.0, 1.2, 0.8, 1.0, 1.1, 0.9],
  /* dark  */ [1.2, 1.1, 1.1, 1.1, 1.1, 0.9, 0.8],
  /* light */ [1.2, 0.9, 0.9, 0.9, 0.9, 1.5, 1.0],
]

/**
 * Battle_GetDamage.cpp:1605–1632: damage × table[attack][defense] × (attack level / defense
 * level), levels under 1 counted as 1; a level over 5 or an unknown element skips it. At least 1.
 * Also against no element at all: a fire monster hits an unaligned hero 1.3 × harder.
 */
export function elementDamage(damage: number, attack = 0, defense = 0): number {
  const attType = attack & 0xf,
    defType = defense & 0xf
  const attLevel = Math.max(1, (attack >> 4) & 0xf),
    defLevel = Math.max(1, (defense >> 4) & 0xf)
  if (attLevel > 5 || defLevel > 5 || attType > 6 || defType > 6) return Math.max(1, damage)
  // the source multiplies in float (32-bit) before the int cast
  const factor = Math.fround(Math.fround(ELEMENT_TABLE[attType]![defType]!) * (attLevel / defLevel))
  return Math.max(1, Math.trunc(Math.fround(damage * factor)))
}

/** One attack; `multiplier` scales the damage (skills). */
export function rollAttack(
  attacker: AttackRollInput,
  defender: AttackRollInput,
  rng: Rng,
  multiplier = 1,
  skill = false,
  power?: DamagePower,
): AttackResult {
  const ratings = attackRatings(
    attacker.level,
    defender.level,
    attacker.stats.hit ?? 100,
    (attacker.stats.attackType === 'magic' ? defender.stats.magicEvasion : defender.stats.dodge) ??
      defender.stats.dodge ??
      16,
    defender.stats.avoidPerLevel ?? 1,
  )
  if (!rollRatings(ratings.hit, ratings.avoid, rng)) {
    return { kind: 'miss', damage: 0 }
  }

  if (power) {
    const damage = sourceSkillDamage(attacker, defender, power)
    // MDT_ONLYPOWER returns before the elements (Battle_GetDamage.cpp:641–659)
    return {
      kind: 'hit',
      damage:
        power.type === 0
          ? damage
          : elementDamage(damage, attacker.stats.attackElement, defender.stats.defenseElement),
    }
  }
  const variance = attacker.stats.clientContext
    ? 1
    : 1 - DAMAGE_VARIANCE + rng() * DAMAGE_VARIANCE * 2
  const weights = sourceHitWeights(attacker, defender)
  const sourceType = weights ? selectSourceHit(weights, rng) : null
  const crit = sourceType ? sourceType === 'critical' : chance(rng, attacker.stats.critChance)
  const raw =
    baseDamage(
      attacker.stats.attack,
      attacker.stats.attackType === 'magic'
        ? (defender.stats.magicDefense ?? defender.stats.defense)
        : defender.stats.defense,
    ) *
    variance *
    multiplier *
    (sourceType ? HIT_MULTIPLIER[sourceType] : crit ? attacker.stats.critMultiplier : 1)
  const fromNpc = sourceType ? npcDamage(attacker, defender, undefined, sourceType) : null
  let damage =
    fromNpc ??
    (attacker.stats.clientContext
      ? sourceSkillDamage(
          attacker,
          defender,
          undefined,
          sourceType ?? (crit ? 'critical' : 'normal'),
        )
      : Math.max(1, Math.round(raw)))
  // Battle_GetDamage.cpp:1559–1568: blocking halves normal damage, after integer damage calculation.
  if (
    !skill &&
    (defender.stats.blockChance ?? 0) > 0 &&
    chance(rng, (defender.stats.blockChance ?? 0) / 100)
  ) {
    damage = Math.max(1, Math.trunc(damage / 2))
  }
  damage = elementDamage(damage, attacker.stats.attackElement, defender.stats.defenseElement)
  return { kind: sourceType === 'deadly' ? 'deadly' : crit ? 'crit' : 'hit', damage }
}
