/**
 * Save format, versioning and migrations. Pure — storage access lives in the service layer.
 * The save is one account: settings + up to MAX_CHARACTERS characters (future database rows).
 * When the shape changes: bump SAVE_VERSION and add a migration from the previous version.
 */
import { BOOK_MILESTONES } from '../data/bookRewards.ts'
import { CLASSES } from '../data/classes.ts'
import { MONSTERS } from '../data/monsters.ts'
import { MAX_LEVEL } from '../data/progression.ts'
import { getItem, getOption, getRareSet, slotsFor } from '../data/items.ts'
import { getSkill } from '../data/skills.ts'
import { getTitle } from '../data/titles.ts'
import type { ClassId, EquipSlot } from '../data/types.ts'
import { ZONES } from '../data/zones.ts'
import {
  MAX_CHARACTERS,
  NAME_MAX,
  startLocation,
  type CharacterData,
  type CharacterLocation,
  type Expedition,
} from './character.ts'
import {
  MAX_PLUS,
  freeHands,
  starterEquipment,
  type Equipment,
  type GearPiece,
} from './equipment.ts'
import { newId } from './id.ts'
import { addToInventory, type ItemStack } from './loot.ts'
import { OPTION_PLAY_SECONDS } from './options.ts'
import {
  POTION_GROUPS,
  fitsSlot,
  fullestPotion,
  type PotionGroup,
  type PotionSlot,
  type PotionSlots,
} from './potions.ts'
import { zoneSpots } from './spots.ts'
import type { OwnedTitle } from './titles.ts'
import {
  SKILL_BAR_SIZE,
  defaultBar,
  skillRank,
  starterSkills,
  type LearnedSkill,
} from './skills.ts'

export const SAVE_VERSION = 12

export type GraphicsQuality = 'auto' | 'low' | 'high' | 'ultra'

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
  // v5: skills — no SP yet, the free first skills of the class are known
  4: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) =>
          isRecord(c) && typeof c.classId === 'string' && Object.hasOwn(CLASSES, c.classId)
            ? { ...c, sp: 0, skills: starterSkills(c.classId as ClassId) }
            : c,
        )
      : [],
  }),
  // v6: equipment — everyone wears the free starter set of their class
  5: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) =>
          isRecord(c) && typeof c.classId === 'string' && Object.hasOwn(CLASSES, c.classId)
            ? { ...c, equipment: starterEquipment(c.classId as ClassId), gear: [] }
            : c,
        )
      : [],
  }),
  // v7: accessories with options, potions used automatically, a skill bar of 7
  6: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) =>
          isRecord(c) && typeof c.classId === 'string' && Object.hasOwn(CLASSES, c.classId)
            ? {
                ...c,
                potionAuto: { hp: true, mp: true },
                skillBar: defaultBar(
                  c.classId as ClassId,
                  sanitizeSkills(c.skills, c.classId as ClassId),
                ),
              }
            : c,
        )
      : [],
  }),
  // v8: rare items (identified pieces carry their set), options from play time
  7: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) => (isRecord(c) ? { ...c, optionProgress: 0 } : c))
      : [],
  }),
  // v9: the player chooses the potion of each quick slot; until now the hero drank every potion it
  // had, so each slot gets the potion of its kind the bag holds most of
  8: (save) => ({
    ...save,
    characters: Array.isArray(save.characters)
      ? save.characters.map((c: unknown) => {
          if (!isRecord(c)) return c
          const { potionAuto, ...rest } = c
          const inventory = sanitizeInventory(c.inventory)
          const level = int(c.level, 1)
          const slot = (group: PotionGroup): PotionSlot => ({
            itemId: fullestPotion(inventory, level, group),
            auto: !isRecord(potionAuto) || potionAuto[group] !== false,
          })
          return { ...rest, potionSlots: { hp: slot('hp'), mp: slot('mp') } }
        })
      : [],
  }),
  // v10: hunting spots open one by one, expeditions, play time and kills per monster; the new fields
  // start at their defaults (sanitizeCharacter) and the spot a character is at counts as reached
  9: (save) => save,
  // v11: titles (none yet; sanitizeCharacter fills the empty list)
  10: (save) => save,
  // v12: monster book rewards claimed (none yet; sanitizeCharacter fills the empty record)
  11: (save) => save,
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
    quality: ['auto', 'low', 'high', 'ultra'].includes(settings.quality as string)
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
  const location = sanitizeLocation(raw.location)
  // dual swords and a shield together (saves from before that rule): the shield goes to the bag
  return freeHands({
    id: raw.id,
    name: raw.name.trim().slice(0, NAME_MAX),
    classId: raw.classId as ClassId,
    level: Math.min(MAX_LEVEL, Math.max(1, int(raw.level, 1))),
    exp: int(raw.exp, 0),
    gold: int(raw.gold, 0),
    createdAt,
    lastPlayedAt: num(raw.lastPlayedAt, createdAt),
    location,
    reachedSpots: sanitizeReached(raw.reachedSpots, location),
    stats: {
      kills: int(stats.kills, 0),
      deaths: int(stats.deaths, 0),
      expeditions: int(stats.expeditions, 0),
      playSeconds: num(stats.playSeconds, 0),
      monsterKills: sanitizeMonsterKills(stats.monsterKills),
      bookClaims: sanitizeBookClaims(stats.bookClaims),
    },
    inventory: sanitizeInventory(raw.inventory),
    expedition: sanitizeExpedition(raw.expedition),
    sp: int(raw.sp, 0),
    skills: sanitizeSkills(raw.skills, raw.classId as ClassId),
    skillBar: sanitizeBar(raw.skillBar, sanitizeSkills(raw.skills, raw.classId as ClassId)),
    equipment: sanitizeEquipment(raw.equipment),
    gear: (Array.isArray(raw.gear) ? raw.gear : [])
      .map((p: unknown) => sanitizePiece(p))
      .filter((p): p is GearPiece => p !== null),
    potionSlots: sanitizePotionSlots(raw.potionSlots),
    optionProgress: Math.min(OPTION_PLAY_SECONDS, Math.max(0, num(raw.optionProgress, 0))),
    ...sanitizeTitles(raw.titles, raw.activeTitle),
  })
}

/**
 * The farthest open spot per zone, where the spot still exists; the spot the character is at counts
 * as reached (saves from before spots: everything up to it is open).
 */
function sanitizeReached(raw: unknown, location: CharacterLocation): Record<string, string> {
  const reached: Record<string, string> = {}
  for (const [zoneId, monsterId] of Object.entries(isRecord(raw) ? raw : {})) {
    if (typeof monsterId === 'string' && zoneSpots(zoneId).includes(monsterId)) {
      reached[zoneId] = monsterId
    }
  }
  const spots = zoneSpots(location.zoneId)
  const here = spots.indexOf(location.monsterId)
  const farthest = reached[location.zoneId]
  if (here > 0 && (farthest === undefined || spots.indexOf(farthest) < here)) {
    reached[location.zoneId] = location.monsterId
  }
  return reached
}

/** Titles that still exist (each once), and the worn one when the character has it. */
function sanitizeTitles(
  raw: unknown,
  active: unknown,
): { titles: OwnedTitle[]; activeTitle: number | null } {
  const titles: OwnedTitle[] = []
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!isRecord(entry)) continue
    const id = int(entry.id, -1)
    if (!getTitle(id) || titles.some((t) => t.id === id)) continue
    const expiresAt = entry.expiresAt === null ? null : num(entry.expiresAt, -1)
    if (expiresAt === -1) continue
    titles.push({ id, expiresAt })
  }
  const worn = int(active, -1)
  return { titles, activeTitle: titles.some((t) => t.id === worn) ? worn : null }
}

/** Claimed monster book rewards of monsters that still exist (at most every milestone). */
function sanitizeBookClaims(raw: unknown): Record<string, number> {
  const claims: Record<string, number> = {}
  for (const [monsterId, count] of Object.entries(isRecord(raw) ? raw : {})) {
    const n = Math.min(BOOK_MILESTONES.length, int(count, 0))
    if (MONSTERS[monsterId] && n > 0) claims[monsterId] = n
  }
  return claims
}

/** Kill counts of monsters that still exist. */
function sanitizeMonsterKills(raw: unknown): Record<string, number> {
  const kills: Record<string, number> = {}
  for (const [monsterId, count] of Object.entries(isRecord(raw) ? raw : {})) {
    const n = int(count, 0)
    if (MONSTERS[monsterId] && n > 0) kills[monsterId] = n
  }
  return kills
}

/** Learned active skills on the bar, each once, at most SKILL_BAR_SIZE. */
function sanitizeBar(raw: unknown, skills: Record<string, LearnedSkill>): number[] {
  const ids = (Array.isArray(raw) ? raw : []).map((id: unknown) => int(id, 0))
  const usable = new Set(Object.keys(skills).map(Number))
  const active = (id: number) => {
    const skill = getSkill(id)
    return skill !== undefined && skillRank(skill, 1).kind !== 'passive'
  }
  return [...new Set(ids)].filter((id) => usable.has(id) && active(id)).slice(0, SKILL_BAR_SIZE)
}

/** A weapon or armor piece that still exists. */
function sanitizePiece(raw: unknown): GearPiece | null {
  if (!isRecord(raw) || typeof raw.uid !== 'string' || !raw.uid) return null
  const itemId = int(raw.itemId, 0)
  const item = getItem(itemId)
  if (!item.gear) return null
  // a rare item keeps its set when the set is one the item can get; without one it is unidentified
  const rare = int(raw.rare, -1)
  const identified = item.rare?.some((r) => r.set === rare) && getRareSet(rare) !== undefined
  const options = (Array.isArray(raw.options) ? raw.options : []).flatMap((o: unknown) => {
    if (!isRecord(o)) return []
    const type = int(o.type, -1)
    const level = int(o.level, 0)
    const def = getOption(type)
    return def && level >= 1 && level <= def.values.length ? [{ type, level }] : []
  })
  const keepOptions = options.length > 0 && (!item.rare || identified)
  return {
    uid: raw.uid,
    itemId,
    plus: item.upgradeable ? Math.min(MAX_PLUS, int(raw.plus, 0)) : 0,
    ...(keepOptions ? { options } : {}),
    ...(identified ? { rare } : {}),
  }
}

/** Worn pieces in the slot they belong to. */
function sanitizeEquipment(raw: unknown): Equipment {
  const equipment: Equipment = {}
  if (!isRecord(raw)) return equipment
  for (const [slot, entry] of Object.entries(raw)) {
    const piece = sanitizePiece(entry)
    if (piece && slotsFor(getItem(piece.itemId).gear!).includes(slot as EquipSlot)) {
      equipment[slot as EquipSlot] = piece
    }
  }
  return equipment
}

/** Learned skills that still exist for the class, at a level they have. */
function sanitizeSkills(raw: unknown, classId: ClassId): Record<string, LearnedSkill> {
  const skills: Record<string, LearnedSkill> = {}
  if (!isRecord(raw)) return skills
  for (const [id, entry] of Object.entries(raw)) {
    const skill = getSkill(Number(id))
    if (!skill || skill.classId !== classId || !isRecord(entry)) continue
    const level = Math.min(skill.levels.length, int(entry.level, 0))
    if (level < 1) continue
    skills[skill.id] = { level, auto: typeof entry.auto === 'boolean' ? entry.auto : true }
  }
  return skills
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

/** A potion of the slot's kind (or nothing) in each quick slot. */
function sanitizePotionSlots(raw: unknown): PotionSlots {
  const slots = isRecord(raw) ? raw : {}
  const slot = (group: PotionGroup): PotionSlot => {
    const entry = isRecord(slots[group]) ? slots[group] : {}
    const itemId = int(entry.itemId, 0)
    return {
      itemId: itemId > 0 && fitsSlot(itemId, group) ? itemId : null,
      auto: entry.auto !== false,
    }
  }
  return Object.fromEntries(POTION_GROUPS.map((g) => [g, slot(g)])) as PotionSlots
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
