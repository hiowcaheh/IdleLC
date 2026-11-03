/** Raw hit/avoid points, not percentages. Source: PC.cpp:270–301,6301–6383 and Battle_GetDamage.cpp:1826–1840. */
import type { ClassId } from '../data/types.ts'
import { ATTRIBUTE_GROWTH } from './attributes.ts'
import { rollInt, type Rng } from './rng.ts'

const HIT: Record<ClassId, number> = {
  titan: 137,
  knight: 130,
  healer: 142,
  mage: 142,
  rogue: 142,
  sorcerer: 137,
}
const AVOID: Record<ClassId, number> = {
  titan: 20,
  knight: 28,
  healer: 50,
  mage: 50,
  rogue: 50,
  sorcerer: 44,
}

/** IdleLC's selected attack channel, without second professions or allocated points. */
export function classRatings(
  classId: ClassId,
  level: number,
): { hit: number; dodge: number; avoidPerLevel: number } {
  const magic = classId === 'mage' || classId === 'sorcerer'
  const growth = ATTRIBUTE_GROWTH[classId][magic ? 2 : 1] * Math.max(0, Math.floor(level) - 1)
  return { hit: HIT[classId] + growth, dodge: AVOID[classId] + growth, avoidPerLevel: 10 }
}

/** The original random function has invalid zero/negative ranges; the adapter makes these deterministic. */
export function rollRatings(hit: number, avoid: number, rng: Rng): boolean {
  const n = Math.max(0, Math.trunc(hit * 1000))
  const m = Math.max(0, Math.trunc(avoid * 1000))
  if (n === 0) return false
  if (m === 0) return true
  return rollInt(rng, 1, n) > rollInt(rng, 1, m)
}

export function ratingHitChance(hit: number, avoid: number): number {
  const n = Math.max(0, Math.trunc(hit * 1000))
  const m = Math.max(0, Math.trunc(avoid * 1000))
  if (n === 0) return 0
  if (m === 0) return 1
  return n >= m ? 1 - (m + 1) / (2 * n) : (n - 1) / (2 * m)
}
