/**
 * The Sorcerer's elementals, as the November 2018 server makes them: GameServer/Elemental.cpp (stats
 * taken from the summoner), PC.cpp SummonElemental / UnsummonElemental / CanSummonElemental (which
 * may stand together, the delay before one comes back) and ShareLib/Config.h ELEMENTAL_* (attack
 * speed, range, duration). Pure.
 *
 * The client drives an elemental's swings (doFuncAttack.cpp: the client sends them); IdleLC swings
 * at the hero's monster every ELEMENTAL_ATTACK_SPEED and lets the elemental reach the monster with
 * the hero (own adaptation, docs/design-decisions.md).
 */
import type { CombatStats } from '../data/types.ts'
import { classAttributes } from './attributes.ts'
import { bindCombatChannels } from './clientStats.ts'
import { applyStats, type StatEffect } from './skills.ts'

/** Config.h ELEMENTAL_FIRE / WIND / EARTH / WATER: the power of MST_OTHER_SUMMON. */
export type ElementalType = 0 | 1 | 2 | 3

export const ELEMENTAL_NAMES: Record<ElementalType, string> = {
  0: 'Fire Elemental',
  1: 'Wind Elemental',
  2: 'Earth Elemental',
  3: 'Water Elemental',
}

/** The models the client draws them with (CSlaveInfo, Data\NPC\Summon\*.smc). */
export const ELEMENTAL_MODELS: Record<ElementalType, string> = {
  0: 'summonfire',
  1: 'summonwind',
  2: 'summonland',
  3: 'summonwater',
}

interface ElementalRow {
  /** m_defHP before the summoner's STR and CON. */
  hp: number
  /** Share of the summoner's m_eqMagic / m_opMagic, as numerator / denominator. */
  magic: readonly [number, number]
  /** Share of the summoner's m_eqDefense / m_opDMelee / m_opDRange. */
  defense: readonly [number, number]
  /** ELEMENTAL_ATTACK_RANGE_* in metres. */
  range: number
}

/** Elemental.cpp:28–108. */
const ROWS: Record<ElementalType, ElementalRow> = {
  0: { hp: 50, magic: [8, 10], defense: [15, 10], range: 2 },
  1: { hp: 30, magic: [11, 10], defense: [14, 10], range: 7 },
  2: { hp: 50, magic: [12, 10], defense: [12, 10], range: 3 },
  3: { hp: 30, magic: [88, 100], defense: [14, 10], range: 7 },
}

/** SUMMON_DURATION: 20 minutes, then the elemental leaves. */
export const SUMMON_DURATION = 20 * 60
/** SUMMON_DELAY for the USA build: 5 s after one of a kind left before it can come again. */
export const SUMMON_DELAY = 5
/** ELEMENTAL_ATTACK_SPEED 20 pulses: one swing every 2 seconds. */
export const ELEMENTAL_ATTACK_INTERVAL = 2
/** ELEMENTAL_RECOVER_HP: HP it regains each 3-second recovery pulse. */
export const ELEMENTAL_RECOVER_HP = 1
/** ELEMENTAL_RUN_SPEED in metres a second. */
const ELEMENTAL_RUN_SPEED = 8

export function isElementalType(value: number): value is ElementalType {
  return value === 0 || value === 1 || value === 2 || value === 3
}

/**
 * CanSummonElemental (PC.cpp:5249–5305): fire and wind never stand with earth or water, and only
 * one of each kind.
 */
export function elementalBlocks(present: ElementalType, wanted: ElementalType): boolean {
  if (present === wanted) return true
  const fireOrWind = (t: ElementalType) => t === 0 || t === 1
  return fireOrWind(present) !== fireOrWind(wanted)
}

/**
 * t_skill.a_sorcerer application bits (Skill.h SSF_APP_*) of the base Sorcerer's passives. The 2016
 * database dump has no such column; these are the values in the 2015 client's skills.lod
 * (Engine/Entities/Skill.cpp reads the same field). Bit 0 is the Sorcerer, bit n + 1 elemental n.
 */
const SORCERER_APPLY: Readonly<Record<number, number>> = {
  296: 0x61, // Cursed soul
  297: 0x48, // Empowered Earth Elemental
  298: 0x22, // Empowered Fire Elemental
  302: 0x50, // Empowered Water Elemental
  303: 0x24, // Empowered Wind Elemental
  304: 0x7f, // Defense shield
  306: 0x61, // Vital mastery
}
const SSF_APP_CHARACTER = 1

/** CPC::ApplyPassive / CElemental::ApplyPassive: whom a passive skill strengthens. */
export function passiveAppliesTo(skillId: number, who: 'hero' | ElementalType): boolean {
  const flags = SORCERER_APPLY[skillId]
  if (flags === undefined) return who === 'hero'
  return (flags & (who === 'hero' ? SSF_APP_CHARACTER : 1 << (who + 1))) !== 0
}

/** The elementals a passive skill strengthens, for the Skills window. */
export function passiveElementals(skillId: number): ElementalType[] {
  return ([0, 1, 2, 3] as const).filter((t) => passiveAppliesTo(skillId, t))
}

/** An elemental with the hero's own range of fire. */
export function elementalRange(type: ElementalType): number {
  return ROWS[type].range
}

/**
 * An elemental's stats at the moment it is summoned (CElemental::CElemental, then CalcStatus with
 * its passives): STR / DEX / INT / CON, level and armor level of the summoner; HP from the type's
 * base and the summoner's STR and CON above the Sorcerer's starting values; a share of the
 * summoner's weapon and option magic, armor and defense options; m_eqResist = the summoner's level.
 * Hit and evasion are the summoner's (CElemental::GetHitrate / GetAvoid). Its attacks are magic.
 *
 * `hero` is the summoner's sheet before passives and buffs, `final` after its passives.
 */
export function elementalStats(
  type: ElementalType,
  level: number,
  hero: CombatStats,
  final: CombatStats,
  passives: readonly StatEffect[],
): CombatStats | null {
  const context = hero.clientContext
  const client = hero.client
  const finalClient = final.client
  if (!context || !client || !finalClient || !hero.defenseChannels) return null
  const row = ROWS[type]
  const part = (value: number, [n, d]: readonly [number, number]) => Math.trunc((value * n) / d)
  const base = classAttributes('sorcerer', 1)
  const strength = hero.strength ?? base.strength
  const dexterity = hero.dexterity ?? base.dexterity
  const intelligence = hero.intelligence ?? base.intelligence
  const constitution = hero.constitution ?? base.constitution
  const attributePart = Math.trunc((intelligence * 10) / 15)
  const eqMagic = context.equipmentMagic ?? 0
  const opMagic = client.magicAttack - attributePart - eqMagic
  const eqDefense = context.equipmentDefense ?? 0
  const channels = hero.defenseChannels
  const defenseChannels = {
    melee: part(eqDefense, row.defense) + part(channels.melee - eqDefense, row.defense),
    range: part(eqDefense, row.defense) + part(channels.range - eqDefense, row.defense),
    magic: level,
  }
  const maxHp = Math.max(
    1,
    row.hp + 5 * (strength - base.strength) + 5 * (constitution - base.constitution),
  )
  const stats: CombatStats = {
    maxHp,
    maxMp: 0,
    attack: 0,
    defense: 0,
    attackInterval: ELEMENTAL_ATTACK_INTERVAL,
    critChance: 0,
    critMultiplier: 2,
    strength,
    dexterity,
    intelligence,
    constitution,
    attackRange: row.range,
    defenseChannels,
    ...(hero.gearLevels ? { gearLevels: hero.gearLevels } : {}),
    clientContext: {
      ...context,
      magicWeapon: true,
      elemental: true,
      // the option weights and groups belong to the summoner (IS_PC only)
      criticalOptionRate: 0,
      deadlyOptionRate: 0,
      criticalGroups: [],
      deadlyGroups: [],
    },
    client: {
      ...finalClient,
      physicalAttack: 0,
      magicAttack: attributePart + part(eqMagic, row.magic) + part(opMagic, row.magic),
      physicalDefense: level * 3 + defenseChannels.melee,
      magicDefense: level + defenseChannels.magic,
      runSpeed: ELEMENTAL_RUN_SPEED,
      walkSpeed: 5,
    },
  }
  return bindCombatChannels(applyStats(stats, passives))
}
