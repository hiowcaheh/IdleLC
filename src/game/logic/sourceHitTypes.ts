/**
 * SelectHitType_Adult, Battle_GetDamage.cpp:1843–2007: a hero's or a monster's normal attack (skills
 * always hit normal there). Pure.
 */
import type { CombatStats } from '../data/types.ts'
import { classAttributes } from './attributes.ts'
import { rollInt, type Rng } from './rng.ts'

export type SourceHitType = 'weak' | 'normal' | 'strong' | 'hard' | 'critical' | 'deadly'
export const HIT_MULTIPLIER: Record<SourceHitType, number> = {
  weak: 0.8,
  normal: 1,
  strong: 1.3,
  hard: 1.5,
  critical: 2,
  deadly: 2.5,
}

/** nOffense*BaseForNPC, Battle_GetDamage.cpp:1852–1854. */
const NPC_BASE = { strength: 38, dexterity: 28, intelligence: 28 }

export function sourceHitWeights(
  attacker: { level: number; stats: CombatStats },
  defender: { stats: CombatStats },
): number[] | null {
  const a = attacker.stats,
    d = defender.stats,
    context = a.clientContext
  // Missing NPC attributes are a source-data gap, never an assumed zero or inferred level curve.
  if (
    a.strength === undefined ||
    a.dexterity === undefined ||
    a.intelligence === undefined ||
    d.constitution === undefined
  )
    return null
  const magic = a.attackType === 'magic'
  // Hero attackers use their class's level-1 attributes, NPCs 38 STR / 28 DEX / 28 INT.
  const base = context
    ? classAttributes(context.classId, 1)
    : {
        strength: NPC_BASE.strength,
        dexterity: NPC_BASE.dexterity,
        intelligence: NPC_BASE.intelligence,
      }
  // an elemental's magic counts from its summoner's STR base (Battle_GetDamage.cpp:1919–1928)
  const statBase = magic && !context?.elemental ? base.intelligence : base.strength
  // m_con / 3 + m_opStrong (option 104); the passive "stronger" addition has no IdleLC skill yet.
  const durability = Math.trunc(d.constitution / 3) + (d.toughness ?? 0)
  const weights = [
    50 + Math.trunc((attacker.level - 1) / 2) + durability,
    575 + attacker.level - 1 + durability,
    125 +
      Math.trunc((((magic ? a.intelligence : a.strength) - statBase) * 5) / 4) +
      (a.strongBonus ?? 0),
    100 + a.strength - statBase + (a.hardBonus ?? 0),
    90 + Math.trunc(((a.dexterity - base.dexterity) * 9) / 10),
    60 + Math.trunc(((a.dexterity - base.dexterity) * 6) / 10),
  ]
  if (!context) {
    // Battle_GetDamage.cpp:1983–1993: only bosses and mid-bosses land critical and deadly hits.
    if (!a.boss) weights[4] = weights[5] = 0
    return weights.map((value) => Math.max(0, Math.trunc(value)))
  }
  weights[4]! += Math.trunc((weights[4]! * context.criticalOptionRate) / 100)
  weights[5]! += Math.trunc((weights[5]! * context.deadlyOptionRate) / 100)
  // This branch in the supplied November-2018 code uses the rate directly, unlike CmdMsg's sheet.
  // Preserve the expression rather than silently correcting the original server's arithmetic.
  for (const [index, groups] of [
    [4, context.criticalGroups],
    [5, context.deadlyGroups],
  ] as const)
    for (const group of groups ?? []) weights[index]! += group.flat + weights[index]! * group.rate
  return weights.map((value) => Math.max(0, Math.trunc(value)))
}

/** Six independent integer rolls; the last type wins a tie, as in the source loop. */
export function selectSourceHit(weights: readonly number[], rng: Rng): SourceHitType {
  let best = 0,
    maximum = -1
  for (let index = 0; index < 6; index++) {
    const value = weights[index]! > 0 ? rollInt(rng, 1, weights[index]!) : 0
    if (value >= maximum) {
      maximum = value
      best = index
    }
  }
  return (['weak', 'normal', 'strong', 'hard', 'critical', 'deadly'] as const)[best]!
}
