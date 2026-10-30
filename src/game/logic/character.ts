/**
 * Player characters. One record = one future `characters` table row (docs/supabase.md).
 * Pure — creation rules are checked here so the server can run the same code.
 */
import { CLASSES } from '../data/classes.ts'
import type { ClassId } from '../data/types.ts'
import { DEFAULT_ZONE_ID, ZONES } from '../data/zones.ts'
import { starterEquipment, type Equipment, type GearPiece } from './equipment.ts'
import type { ItemStack } from './loot.ts'
import { EMPTY_POTION_SLOTS, type PotionSlots } from './potions.ts'
import { defaultBar, starterSkills, type LearnedSkill } from './skills.ts'
import type { OwnedTitle } from './titles.ts'

export { GameError } from './errors.ts'

export const MAX_CHARACTERS = 4
export const NAME_MIN = 3
export const NAME_MAX = 16

export interface CharacterLocation {
  zoneId: string
  monsterId: string
}

/** An AFK expedition: the character hunts this spot while the player is away. */
export interface Expedition {
  zoneId: string
  monsterId: string
  startedAt: number
}

/** What the character has done: kills and deaths, expeditions, active play time, kills per monster. */
export interface CharacterStats {
  kills: number
  deaths: number
  /** Expeditions finished (claimed after at least AFK_MIN_SECONDS). */
  expeditions: number
  /** Seconds of active play (fights reported; not expeditions or time with the game closed). */
  playSeconds: number
  /** Kills by monster id — the monster book. */
  monsterKills: Record<string, number>
}

export interface CharacterData {
  id: string
  name: string
  classId: ClassId
  level: number
  /** Experience collected towards the next level. */
  exp: number
  gold: number
  createdAt: number
  /** Last time the game heard from this character; time away since then counts as AFK. */
  lastPlayedAt: number
  location: CharacterLocation
  /** The farthest open hunting spot per zone id (logic/spots.ts); a zone not here: its first spot. */
  reachedSpots: Record<string, string>
  stats: CharacterStats
  inventory: ItemStack[]
  /** Set while the character is away on an AFK expedition. */
  expedition: Expedition | null
  /** Skill points in 1/10 000 SP (SP_UNIT), as the LC server counts them. */
  sp: number
  /** Learned skills by skill id. */
  skills: Record<string, LearnedSkill>
  /** Active skills on the bar (at most 7) — the ones used in fights. */
  skillBar: number[]
  /** Worn weapon and armor. */
  equipment: Equipment
  /** Single pieces in the bag: upgraded, with options, accessories (plain ones stack in `inventory`). */
  gear: GearPiece[]
  /** The potions in the HP and MP quick slots (logic/potions.ts). */
  potionSlots: PotionSlots
  /** Seconds of active play toward the next option on a worn piece (logic/options.ts). */
  optionProgress: number
  /** Titles the character has (logic/titles.ts), and the worn one (shown under the name). */
  titles: OwnedTitle[]
  activeTitle: number | null
}

export interface NewCharacter {
  name: string
  classId: ClassId
}

export type CreateCharacterError =
  'name-length' | 'name-characters' | 'name-taken' | 'unknown-class' | 'no-free-slot'

/** Letters and digits, starting with a letter. */
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/

export function checkName(
  name: string,
  existing: readonly CharacterData[],
): CreateCharacterError | null {
  const trimmed = name.trim()
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return 'name-length'
  if (!NAME_PATTERN.test(trimmed)) return 'name-characters'
  const lower = trimmed.toLowerCase()
  if (existing.some((c) => c.name.toLowerCase() === lower)) return 'name-taken'
  return null
}

export function checkNewCharacter(
  input: NewCharacter,
  existing: readonly CharacterData[],
): CreateCharacterError | null {
  if (existing.length >= MAX_CHARACTERS) return 'no-free-slot'
  if (!Object.hasOwn(CLASSES, input.classId)) return 'unknown-class'
  return checkName(input.name, existing)
}

export function startLocation(): CharacterLocation {
  const zone = ZONES[DEFAULT_ZONE_ID]!
  return { zoneId: zone.id, monsterId: zone.monsterIds[0]! }
}

/** A level 1 character in the starting zone. Validate with checkNewCharacter first. */
export function createCharacterData(input: NewCharacter, id: string, now: number): CharacterData {
  return {
    id,
    name: input.name.trim(),
    classId: input.classId,
    level: 1,
    exp: 0,
    gold: 0,
    createdAt: now,
    lastPlayedAt: now,
    location: startLocation(),
    reachedSpots: {},
    stats: { kills: 0, deaths: 0, expeditions: 0, playSeconds: 0, monsterKills: {} },
    inventory: [],
    expedition: null,
    sp: 0,
    skills: starterSkills(input.classId),
    skillBar: defaultBar(input.classId, starterSkills(input.classId)),
    equipment: starterEquipment(input.classId),
    gear: [],
    potionSlots: EMPTY_POTION_SLOTS,
    titles: [],
    activeTitle: null,
    optionProgress: 0,
  }
}
