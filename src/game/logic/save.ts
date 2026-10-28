/**
 * Save format, versioning and migrations. Pure — storage access lives in the service layer.
 * When the shape changes: bump SAVE_VERSION and add a migration from the previous version.
 */
import { MONSTERS } from '../data/monsters.ts'
import { DEFAULT_ZONE_ID, ZONES } from '../data/zones.ts'

export const SAVE_VERSION = 1

export type GraphicsQuality = 'auto' | 'low' | 'high'

export interface Settings {
  quality: GraphicsQuality
  showDamageNumbers: boolean
}

export interface SaveData {
  saveVersion: typeof SAVE_VERSION
  createdAt: number
  settings: Settings
  location: {
    zoneId: string
    monsterId: string
  }
  stats: {
    kills: number
    deaths: number
  }
}

/** Upgrades a save from version N to N + 1. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>

/** Keyed by the version they upgrade FROM. */
export const MIGRATIONS: Record<number, Migration> = {}

export function createDefaultSave(now = Date.now()): SaveData {
  const zone = ZONES[DEFAULT_ZONE_ID]!
  return {
    saveVersion: SAVE_VERSION,
    createdAt: now,
    settings: { quality: 'auto', showDamageNumbers: true },
    location: { zoneId: zone.id, monsterId: zone.monsterIds[0]! },
    stats: { kills: 0, deaths: 0 },
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

/** Fills missing/invalid fields with defaults so a partly broken save still loads. */
function sanitize(raw: Record<string, unknown>, defaults: SaveData): SaveData {
  const settings = isRecord(raw.settings) ? raw.settings : {}
  const location = isRecord(raw.location) ? raw.location : {}
  const stats = isRecord(raw.stats) ? raw.stats : {}

  const quality = ['auto', 'low', 'high'].includes(settings.quality as string)
    ? (settings.quality as GraphicsQuality)
    : defaults.settings.quality

  const zoneId =
    typeof location.zoneId === 'string' && ZONES[location.zoneId]
      ? location.zoneId
      : defaults.location.zoneId
  const monsterId =
    typeof location.monsterId === 'string' &&
    ZONES[zoneId]?.monsterIds.includes(location.monsterId) &&
    MONSTERS[location.monsterId]
      ? location.monsterId
      : ZONES[zoneId]!.monsterIds[0]!

  return {
    saveVersion: SAVE_VERSION,
    createdAt: num(raw.createdAt, defaults.createdAt),
    settings: {
      quality,
      showDamageNumbers:
        typeof settings.showDamageNumbers === 'boolean'
          ? settings.showDamageNumbers
          : defaults.settings.showDamageNumbers,
    },
    location: { zoneId, monsterId },
    stats: {
      kills: Math.floor(num(stats.kills, 0)),
      deaths: Math.floor(num(stats.deaths, 0)),
    },
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
    save: sanitize(migrated, defaults),
    status: version === SAVE_VERSION ? 'loaded' : 'migrated',
  }
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save)
}
