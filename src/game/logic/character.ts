/**
 * Player characters. One record = one future `characters` table row (docs/supabase.md).
 * Pure — creation rules are checked here so the server can run the same code.
 */
import { CLASSES } from '../data/classes.ts'
import type { ClassId } from '../data/types.ts'
import { DEFAULT_ZONE_ID, ZONES } from '../data/zones.ts'
import type { ItemStack } from './loot.ts'

export const MAX_CHARACTERS = 4
export const NAME_MIN = 3
export const NAME_MAX = 16

export interface CharacterLocation {
  zoneId: string
  monsterId: string
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
  stats: { kills: number; deaths: number }
  inventory: ItemStack[]
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
    stats: { kills: 0, deaths: 0 },
    inventory: [],
  }
}

/** A refused command. `code` is stable (UI messages, tests); the message adds details. */
export class GameError extends Error {
  readonly code: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'GameError'
    this.code = code
  }
}
