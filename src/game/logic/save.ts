/**
 * Save format, versioning and migrations. Pure — storage access lives in the service layer.
 * The save is one account: settings + up to MAX_CHARACTERS characters (future database rows).
 * When the shape changes: bump SAVE_VERSION and add a migration from the previous version.
 */
import { CLASSES } from '../data/classes.ts'
import { MONSTERS } from '../data/monsters.ts'
import { MAX_LEVEL } from '../data/progression.ts'
import type { ClassId } from '../data/types.ts'
import { ZONES } from '../data/zones.ts'
import {
  MAX_CHARACTERS,
  NAME_MAX,
  startLocation,
  type CharacterData,
  type CharacterLocation,
  type Expedition,
} from './character.ts'
import { newId } from './id.ts'
import { addToInventory, type ItemStack } from './loot.ts'

export const SAVE_VERSION = 4

export type GraphicsQuality = 'auto' | 'low' | 'high'

export interface Settings {
  quality: GraphicsQuality
  showDamageNumbers: boolean
}

export interface SaveData {
  saveVersion: typeof SAVE_VERSION
  createdAt: number
  settings: Settings
  characters: CharacterData[]
  /** Character that was in play when the game was closed (reopens straight into the game). */
  activeCharacterId: string | null
}

/** Upgrades a save from version N to N + 1. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the version they upgrade FROM. */
export const MIGRATIONS: Record<number, Migration> = {
  // v1 had one implicit knight: its location and kill count become the character "Hero"
  1: (save) => {
    const id = newId()
    const createdAt = typeof save.createdAt === 'number' ? save.createdAt : 0
    const { location, stats, ...rest } = save
    return {
      ...rest,
      characters: [
        {
          id,
          name: 'Hero',
          classId: 'knight',
          level: 1,
          exp: 0,
          gold: 0,
          createdAt,
          lastPlayedAt: createdAt,
          location,
          stats,
        },
      ],
      activeCharacterId: id,
    }
  },
  // v3: characters get an inventory (v4: and an AFK expedition slot, see below)
  2: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) =>
          isRecord(c) ? { ...c, inventory: Array.isArray(c.inventory) ? c.inventory : [] } : c,
        )
      : [],
  }),
  // v4: AFK became an expedition the player starts; nobody is on one yet
  3: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) => (isRecord(c) ? { ...c, expedition: null } : c))
      : [],
  }),
}

export const DEFAULT_SETTINGS: Settings = { quality: 'auto', showDamageNumbers: true }

export function createDefaultSave(now = Date.now()): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS },
    characters: [],
    activeCharacterId: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Applies migrations in order. Returns null when the save can't be upgraded. */
export function applyMigrations(
  raw: Record<string, unknown>,
  migrations: Record<number, Migration>,
  targetVersion: number,
): Record<string, unknown> | null {
  let save = raw
  let version = typeof save.saveVersion === 'number' ? save.saveVersion : 0
  if (version > targetVersion) return null
  while (version < targetVersion) {
    const migrate = migrations[version]
    if (!migrate) return null
    save = { ...migrate(save), saveVersion: version + 1 }
    version += 1
  }
  return save
}

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

const int = (value: unknown, fallback: number) => Math.floor(num(value, fallback))

function sanitizeSettings(raw: unknown): Settings {
  const settings = isRecord(raw) ? raw : {}
  return {
    quality: ['auto', 'low', 'high'].includes(settings.quality as string)
      ? (settings.quality as GraphicsQuality)
      : DEFAULT_SETTINGS.quality,
    showDamageNumbers:
      typeof settings.showDamageNumbers === 'boolean'
        ? settings.showDamageNumbers
        : DEFAULT_SETTINGS.showDamageNumbers,
  }
}

/** Keeps a saved location when its zone and monster still exist, else the starting location. */
export function sanitizeLocation(raw: unknown): CharacterLocation {
  const location = isRecord(raw) ? raw : {}
  const fallback = startLocation()
  const zoneId =
    typeof location.zoneId === 'string' && ZONES[location.zoneId] ? location.zoneId : null
  if (!zoneId) return fallback
  const monsterId =
    typeof location.monsterId === 'string' &&
    ZONES[zoneId]!.monsterIds.includes(location.monsterId) &&
    MONSTERS[location.monsterId]
      ? location.monsterId
      : ZONES[zoneId]!.monsterIds[0]!
  return { zoneId, monsterId }
}

/** A stored character, repaired where possible; null when it cannot be recovered. */
function sanitizeCharacter(raw: unknown, now: number): CharacterData | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null
  if (typeof raw.classId !== 'string' || !Object.hasOwn(CLASSES, raw.classId)) return null
  const stats = isRecord(raw.stats) ? raw.stats : {}
  const createdAt = num(raw.createdAt, now)
  return {
    id: raw.id,
    name: raw.name.trim().slice(0, NAME_MAX),
    classId: raw.classId as ClassId,
    level: Math.min(MAX_LEVEL, Math.max(1, int(raw.level, 1))),
    exp: int(raw.exp, 0),
    gold: int(raw.gold, 0),
    createdAt,
    lastPlayedAt: num(raw.lastPlayedAt, createdAt),
    location: sanitizeLocation(raw.location),
    stats: { kills: int(stats.kills, 0), deaths: int(stats.deaths, 0) },
    inventory: sanitizeInventory(raw.inventory),
    expedition: sanitizeExpedition(raw.expedition),
  }
}

/** A running expedition, if its hunting spot still exists. */
function sanitizeExpedition(raw: unknown): Expedition | null {
  if (!isRecord(raw) || typeof raw.startedAt !== 'number' || !Number.isFinite(raw.startedAt)) {
    return null
  }
  const zone = typeof raw.zoneId === 'string' ? ZONES[raw.zoneId] : undefined
  if (!zone || typeof raw.monsterId !== 'string' || !zone.monsterIds.includes(raw.monsterId)) {
    return null
  }
  return { zoneId: zone.id, monsterId: raw.monsterId, startedAt: raw.startedAt }
}

/** Valid stacks only, merged per item. */
function sanitizeInventory(raw: unknown): ItemStack[] {
  const stacks: ItemStack[] = []
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!isRecord(entry)) continue
    const itemId = int(entry.itemId, 0)
    const count = int(entry.count, 0)
    if (itemId > 0 && count > 0) stacks.push({ itemId, count })
  }
  return addToInventory([], stacks)
}

/** Fills missing/invalid fields with defaults so a partly broken save still loads. */
function sanitize(raw: Record<string, unknown>, now: number): SaveData {
  const characters: CharacterData[] = []
  for (const entry of Array.isArray(raw.characters) ? raw.characters : []) {
    const character = sanitizeCharacter(entry, now)
    if (character && !characters.some((c) => c.id === character.id)) characters.push(character)
    if (characters.length === MAX_CHARACTERS) break
  }
  const active = characters.find((c) => c.id === raw.activeCharacterId)
  return {
    saveVersion: SAVE_VERSION,
    createdAt: num(raw.createdAt, now),
    settings: sanitizeSettings(raw.settings),
    characters,
    activeCharacterId: active ? active.id : null,
  }
}

export interface LoadResult {
  save: SaveData
  /** What happened while loading — shown to testers when something was reset. */
  status: 'new' | 'loaded' | 'migrated' | 'reset-invalid' | 'reset-newer'
}

/** Turns whatever was stored (JSON string or null) into a valid, current save. */
export function loadSave(stored: string | null, now = Date.now()): LoadResult {
  const defaults = createDefaultSave(now)
  if (stored === null) return { save: defaults, status: 'new' }

  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return { save: defaults, status: 'reset-invalid' }
  }
  if (!isRecord(parsed)) return { save: defaults, status: 'reset-invalid' }

  const version = typeof parsed.saveVersion === 'number' ? parsed.saveVersion : 0
  if (version > SAVE_VERSION) return { save: defaults, status: 'reset-newer' }

  const migrated = applyMigrations(parsed, MIGRATIONS, SAVE_VERSION)
  if (!migrated) return { save: defaults, status: 'reset-invalid' }

  return {
    save: sanitize(migrated, now),
    status: version === SAVE_VERSION ? 'loaded' : 'migrated',
  }
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save)
}
