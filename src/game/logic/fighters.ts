/** Combat stats of a character or monster, from the game data. */
import { CLASSES } from '../data/classes.ts'
import { getItem } from '../data/items.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import type { ClassId } from '../data/types.ts'
import { statsForLevel } from './balance.ts'
import type { PotionAuto } from './character.ts'
import type { FighterInit, PotionSupply } from './combat.ts'
import { applyGear, type Equipment } from './equipment.ts'
import { lcPlayerStats } from './lcBalance.ts'
import type { ItemStack } from './loot.ts'
import { applyStats, learnedRanks, passiveEffects, type LearnedSkill } from './skills.ts'

/** What the hero's fighter depends on (a CharacterData fits). */
export interface Hero {
  classId: ClassId
  level: number
  skills?: Readonly<Record<string, LearnedSkill>>
  /** Worn gear; left out = the typical gear of the level (estimates). */
  equipment?: Equipment
  /** Skills used in fights; left out = every learned active skill. */
  skillBar?: readonly number[]
  /** The bag: potions in it are drunk in fights when their kind is set to automatic. */
  inventory?: readonly ItemStack[]
  potionAuto?: PotionAuto
}

/**
 * Potions the hero drinks by itself: those in the bag it is high enough level for, healing and HP
 * recovery potions when `potionAuto.hp` is on, mana and MP recovery potions when `potionAuto.mp` is.
 */
export function potionSupply({ level, inventory = [], potionAuto }: Hero): PotionSupply[] {
  return inventory.flatMap(({ itemId, count }) => {
    const item = getItem(itemId)
    const potion = item.potion
    if (!potion || count <= 0 || level < item.level) return []
    const auto = potion.kind === 'hp' || potion.kind === 'hpRegen' ? potionAuto?.hp : potionAuto?.mp
    return auto === false ? [] : [{ itemId, name: item.name, count, potion }]
  })
}

export function playerFighter(hero: Hero): FighterInit {
  const { classId, level, skills = {}, equipment, skillBar } = hero
  const base = statsForLevel(CLASSES[classId], level)
  // LC data: class stats are not in the LC database yet — scale against LC monsters instead
  const levelStats = lcData ? lcPlayerStats(level, lcData.monsters, base) : base
  const stats = applyGear(levelStats, classId, level, equipment)
  const ranks = learnedRanks(classId, skills)
  return {
    level,
    stats: applyStats(stats, passiveEffects(ranks)),
    skills: ranks.filter((r) => r.kind !== 'passive' && (!skillBar || skillBar.includes(r.id))),
    potions: potionSupply(hero),
  }
}

/** Changes whenever the hero's fighter would (level, skills, auto settings, bar, gear, potions). */
export function heroKey(hero: Hero): string {
  const { classId, level, skills = {}, equipment, skillBar } = hero
  const learned = Object.keys(skills)
    .sort()
    .map((id) => `${id}:${skills[id]!.level}${skills[id]!.auto ? 'a' : ''}`)
  const worn = equipment
    ? Object.entries(equipment)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slot, piece]) => `${slot}:${piece?.uid}+${piece?.plus}`)
        .join(',')
    : 'typical'
  const potions = potionSupply(hero)
    .map((p) => `${p.itemId}x${p.count}`)
    .join(',')
  return `${classId}/${level}/${learned.join(',')}/${worn}/${skillBar?.join(',') ?? 'all'}/${potions}`
}

export function monsterFighter(monsterId: string): FighterInit {
  const monster = getMonster(monsterId)
  return { level: monster.level, stats: monster.stats }
}
