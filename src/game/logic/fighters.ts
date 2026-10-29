/** Combat stats of a character or monster, from the game data. */
import { CLASSES } from '../data/classes.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import type { ClassId } from '../data/types.ts'
import { statsForLevel } from './balance.ts'
import type { FighterInit } from './combat.ts'
import { lcPlayerStats } from './lcBalance.ts'

export function playerFighter(classId: ClassId, level: number): FighterInit {
  const base = statsForLevel(CLASSES[classId], level)
  // LC data: class stats are not in the LC database yet — scale against LC monsters instead
  return { level, stats: lcData ? lcPlayerStats(level, lcData.monsters, base) : base }
}

export function monsterFighter(monsterId: string): FighterInit {
  const monster = getMonster(monsterId)
  return { level: monster.level, stats: monster.stats }
}
