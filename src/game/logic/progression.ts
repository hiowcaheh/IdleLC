/** Experience and levels. Pure — the exp table comes from src/game/data/progression.ts. */
import { EXP_TABLE, MAX_LEVEL } from '../data/progression.ts'

export { MAX_LEVEL }

/** Experience needed to reach the next level; 0 at the maximum level. */
export function expToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0
  return EXP_TABLE[Math.max(1, Math.floor(level)) - 1] ?? 0
}

export interface LevelProgress {
  level: number
  /** Experience collected towards the next level. */
  exp: number
  levelsGained: number
}

/** Adds experience, levelling up as many times as it covers. Exp stops at the maximum level. */
export function gainExp(level: number, exp: number, amount: number): LevelProgress {
  let lvl = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL)
  let current = Math.max(0, exp) + Math.max(0, amount)
  let levelsGained = 0
  while (lvl < MAX_LEVEL && current >= expToNextLevel(lvl)) {
    current -= expToNextLevel(lvl)
    lvl += 1
    levelsGained += 1
  }
  if (lvl >= MAX_LEVEL) current = 0
  return { level: lvl, exp: current, levelsGained }
}
