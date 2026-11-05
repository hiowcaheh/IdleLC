/**
 * How far a hero's normal attack reaches (metres), as the server sets it: the class's range
 * (PC.cpp CalcStatus, Config.h ATTACK_RANGE_*), a Rogue's crossbow, and 2 m more for bows,
 * crossbows, staves and wands from +8 (PC.cpp ApplyItemPlusValue).
 */
import type { ClassId } from '../data/types.ts'

const CLASS_RANGE: Record<ClassId, number> = {
  titan: 2.3,
  knight: 2.3,
  healer: 20,
  mage: 15,
  rogue: 2.3,
  sorcerer: 3,
}
/** t_item.a_subtype_idx of the crossbow (IWEAPON_CROSSBOW): a Rogue shoots from 15 m. */
const CROSSBOW = 1
const ROGUE_CROSSBOW_RANGE = 15
/** Crossbow, staff, short staff, bow, wand, soul: +2 m from +8 (ApplyItemPlusValue). */
const LONGER_FROM_PLUS_8 = new Set([1, 2, 5, 6, 12, 15])

export function heroAttackRange(
  classId: ClassId,
  weapon?: { subtype: number; plus: number } | null,
): number {
  let range =
    classId === 'rogue' && weapon?.subtype === CROSSBOW
      ? ROGUE_CROSSBOW_RANGE
      : CLASS_RANGE[classId]
  if (weapon && weapon.plus >= 8 && LONGER_FROM_PLUS_8.has(weapon.subtype)) range += 2
  return range
}
