/** Combat stats of a character or monster, from the game data. */
import { CLASSES } from '../data/classes.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import type { ClassId } from '../data/types.ts'
import { statsForLevel } from './balance.ts'
import type { FighterInit } from './combat.ts'
import { lcPlayerStats } from './lcBalance.ts'
import { applyStats, learnedRanks, passiveEffects, type LearnedSkill } from './skills.ts'

/** What the hero's fighter depends on (a CharacterData fits). */
export interface Hero {
  classId: ClassId
  level: number
  skills?: Readonly<Record<string, LearnedSkill>>
}

export function playerFighter({ classId, level, skills = {} }: Hero): FighterInit {
  const base = statsForLevel(CLASSES[classId], level)
  // LC data: class stats are not in the LC database yet — scale against LC monsters instead
  const stats = lcData ? lcPlayerStats(level, lcData.monsters, base) : base
  const ranks = learnedRanks(classId, skills)
  return {
    level,
    stats: applyStats(stats, passiveEffects(ranks)),
    skills: ranks.filter((r) => r.kind !== 'passive'),
  }
}

/** Changes whenever the hero's fighter would (level, learned skills, auto settings). */
export function heroKey({ classId, level, skills = {} }: Hero): string {
  const learned = Object.keys(skills)
    .sort()
    .map((id) => `${id}:${skills[id]!.level}${skills[id]!.auto ? 'a' : ''}`)
  return `${classId}/${level}/${learned.join(',')}`
}

export function monsterFighter(monsterId: string): FighterInit {
  const monster = getMonster(monsterId)
  return { level: monster.level, stats: monster.stats }
}
