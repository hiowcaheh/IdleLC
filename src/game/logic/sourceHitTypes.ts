/** SelectHitType_Adult, Battle_GetDamage.cpp:1844–2007 (unpromoted PC / ordinary NPC). */
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

export function sourceHitWeights(
  attacker: { level: number; stats: CombatStats },
  defender: { stats: CombatStats },
): number[] | null {
  const a = attacker.stats,
    d = defender.stats,
    context = a.clientContext
  // Missing NPC attributes are a source-data gap, never an assumed zero or inferred level curve.
  if (
    !context ||
    a.strength === undefined ||
    a.dexterity === undefined ||
    a.intelligence === undefined ||
    d.constitution === undefined
  )
    return null
  const base = classAttributes(context.classId, 1)
  const magic = a.attackType === 'magic'
  const statBase = magic ? base.intelligence : base.strength
  const durability = Math.trunc(d.constitution / 3)
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
