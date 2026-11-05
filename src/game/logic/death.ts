/**
 * What a hero loses when a monster kills it (Battle_ProcDead_PC.cpp:244–307,463–487): nothing up
 * to level 10, then 5% (11–20), 3% (21–35) and 2% (36+) of the EXP its level needs and of its SP,
 * each taken as `trunc(x / 100) × rate`, never more than it has (no level is lost). Items that
 * soften it, combo zones and PvP rules do not exist in IdleLC. Pure.
 */
import { expToNextLevel } from './progression.ts'

/** The loss rate in % at a level. */
export function deathPenaltyRate(level: number): number {
  if (level < 11) return 0
  if (level < 21) return 5
  if (level < 36) return 3
  return 2
}

/** EXP and SP (internal units) a death takes from a hero with `exp` and `sp`. */
export function deathLoss(level: number, exp: number, sp: number): { exp: number; sp: number } {
  const rate = deathPenaltyRate(level)
  return {
    exp: Math.min(Math.max(0, exp), Math.trunc(expToNextLevel(level) / 100) * rate),
    sp: Math.min(Math.max(0, sp), Math.trunc(sp / 100) * rate),
  }
}
