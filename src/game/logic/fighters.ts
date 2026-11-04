/** Combat stats of a character or monster, from the game data. */
import { CLASSES } from '../data/classes.ts'
import { getItem } from '../data/items.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import type { ClassId } from '../data/types.ts'
import { classAttributes, classResources, type Attributes } from './attributes.ts'
import { classRatings } from './ratings.ts'
import { bindCombatChannels, clientStatChannels } from './clientStats.ts'
import { statsForLevel } from './balance.ts'
import type { FighterInit, PotionSupply } from './combat.ts'
import { wielded, type Equipment } from './equipment.ts'
import { optionEffects } from './options.ts'
import type { ItemStack } from './loot.ts'
import { POTION_GROUPS, countOwned, potionGroup, type PotionSlots } from './potions.ts'
import {
  applyStats,
  interpretEffect,
  learnedRanks,
  passiveEffects,
  skillRank,
  wieldableRanks,
  type LearnedSkill,
} from './skills.ts'
import { activeTitleId, titleOptions, type OwnedTitle } from './titles.ts'

/** What the hero's fighter depends on (a CharacterData fits). */
export interface Hero {
  classId: ClassId
  level: number
  allocatedStats?: Readonly<Partial<Attributes>>
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
  titles?: readonly OwnedTitle[]
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

export function playerFighter(hero: Hero, now = Date.now()): FighterInit {
  const { classId, level, skills = {}, equipment, skillBar } = hero
  const base = statsForLevel(CLASSES[classId], level)
  const points = hero.allocatedStats ?? {}
  const resources = classResources(classId, level, points)
  const options = [
    ...Object.values(equipment ?? {}).flatMap((piece) => piece?.options ?? []),
    ...titleOptions(activeTitleId(hero, now)),
  ]
  const weapon = equipment?.weapon && getItem(equipment.weapon.itemId).gear
  const stats = applyStats(
    {
      ...base,
      ...resources,
      critMultiplier: 2,
      attackInterval: weapon?.attackInterval ?? 1.2,
      strongBonus: (equipment?.weapon?.plus ?? 0) >= 10 ? 300 : 0,
      hardBonus: (equipment?.weapon?.plus ?? 0) >= 12 ? 400 : 0,
      ...classAttributes(classId, level, points),
      ...classRatings(classId, level),
    },
    // The channel-specific equipment options are applied once by clientStatChannels below.
    optionEffects(
      options.filter((o) => ![50, 56, 57, 79, 80].includes(o.type)),
      classId,
      level,
      equipment,
      undefined,
      points,
    ),
  )
  // skills that need other gear (a shield, another weapon) are left out; estimates assume the gear fits
  const learned = learnedRanks(classId, skills)
  const ranks = equipment ? wieldableRanks(learned, wielded(equipment)) : learned
  const detailed = bindCombatChannels({
    ...stats,
    ...clientStatChannels(stats, classId, level, equipment, options),
  })
  return {
    level,
    stats: applyStats(detailed, passiveEffects(ranks)),
    skills: ranks.filter((r) => r.kind !== 'passive' && (!skillBar || skillBar.includes(r.id))),
    potions: potionSupply(hero),
  }
}

/** Changes whenever the hero's fighter would (level, skills, auto settings, bar, gear, potions). */
export function heroKey(hero: Hero, now = Date.now()): string {
  const { classId, level, skills = {}, equipment, skillBar } = hero
  const learned = Object.keys(skills)
    .sort()
    .map((id) => `${id}:${skills[id]!.level}${skills[id]!.auto ? 'a' : ''}`)
  const worn = equipment
    ? JSON.stringify(
        Object.entries(equipment)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([slot, piece]) => [
            slot,
            piece?.uid,
            piece?.itemId,
            piece?.plus,
            piece?.rare,
            piece?.options?.map(({ type, level }) => [type, level]) ?? [],
          ]),
      )
    : 'typical'
  const potions = potionSupply(hero)
    .map((p) => `${p.itemId}x${p.count}`)
    .join(',')
  const active = activeTitleId(hero, now)
  const owned = hero.titles?.find((title) => title.id === active)
  const title = active === null ? 'none' : `${active}@${owned?.expiresAt ?? 'permanent'}`
  return `${classId}/${level}/${JSON.stringify(hero.allocatedStats ?? {})}/${learned.join(',')}/${worn}/${skillBar?.join(',') ?? 'all'}/${potions}/${title}`
}

export function monsterFighter(monsterId: string): FighterInit {
  const monster = getMonster(monsterId)
  const source = lcData?.monsters.find((m) => m.id === monsterId)
  const skills = (source?.skills ?? []).flatMap((slot) => {
    const skill = lcData?.npcSkills?.find((s) => s.id === slot.id)
    const level = skill?.levels.find((l) => l.level === slot.level)
    if (!skill || !level || level.effects.some((e) => interpretEffect(e) === null)) return []
    return [{ ...skillRank(skill, slot.level), npcSlot: slot.slot, npcProbability: slot.prob }]
  })
  return { level: monster.level, stats: monster.stats, ...(skills.length ? { skills } : {}) }
}
