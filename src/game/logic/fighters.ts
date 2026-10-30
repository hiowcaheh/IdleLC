/** Combat stats of a character or monster, from the game data. */
import { CLASSES } from '../data/classes.ts'
import { getItem } from '../data/items.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import type { ClassId } from '../data/types.ts'
import { statsForLevel } from './balance.ts'
import type { FighterInit, PotionSupply } from './combat.ts'
import { applyGear, wielded, type Equipment } from './equipment.ts'
import { lcPlayerStats } from './lcBalance.ts'
import { optionEffects } from './options.ts'
import type { ItemStack } from './loot.ts'
import { POTION_GROUPS, countOwned, potionGroup, type PotionSlots } from './potions.ts'
import {
  applyStats,
  learnedRanks,
  passiveEffects,
  wieldableRanks,
  type LearnedSkill,
} from './skills.ts'
import { titleOptions } from './titles.ts'

/** What the hero's fighter depends on (a CharacterData fits). */
export interface Hero {
  classId: ClassId
  level: number
  skills?: Readonly<Record<string, LearnedSkill>>
  /** Worn gear; left out = the typical gear of the level (estimates). */
  equipment?: Equipment
  /** Skills used in fights; left out = every learned active skill. */
  skillBar?: readonly number[]
  /** The bag: the potions of the quick slots come from it. */
  inventory?: readonly ItemStack[]
  potionSlots?: PotionSlots
  /** The worn title: its options count like gear options. */
  activeTitle?: number | null
}

/**
 * Potions the hero drinks by itself: the ones in the HP and MP quick slots whose automatic use is
 * on, while the bag has them and the hero is high enough level for them.
 */
export function potionSupply({ level, inventory = [], potionSlots }: Hero): PotionSupply[] {
  if (!potionSlots) return []
  return POTION_GROUPS.flatMap((group) => {
    const { itemId, auto } = potionSlots[group]
    if (!auto || itemId === null) return []
    const item = getItem(itemId)
    const potion = item.potion
    const count = countOwned(inventory, itemId)
    if (!potion || potionGroup(potion.kind) !== group || count <= 0 || level < item.level) return []
    return [{ itemId, name: item.name, count, potion }]
  })
}

export function playerFighter(hero: Hero): FighterInit {
  const { classId, level, skills = {}, equipment, skillBar } = hero
  const base = statsForLevel(CLASSES[classId], level)
  // LC data: class stats are not in the LC database yet — scale against LC monsters instead
  const levelStats = lcData ? lcPlayerStats(level, lcData.monsters, base) : base
  const withGear = applyGear(levelStats, classId, level, equipment)
  const stats = applyStats(withGear, optionEffects(titleOptions(hero.activeTitle), classId))
  // skills that need other gear (a shield, another weapon) are left out; estimates assume the gear fits
  const learned = learnedRanks(classId, skills)
  const ranks = equipment ? wieldableRanks(learned, wielded(equipment)) : learned
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
  const title = hero.activeTitle ?? 'none'
  return `${classId}/${level}/${learned.join(',')}/${worn}/${skillBar?.join(',') ?? 'all'}/${potions}/${title}`
}

export function monsterFighter(monsterId: string): FighterInit {
  const monster = getMonster(monsterId)
  return { level: monster.level, stats: monster.stats }
}
