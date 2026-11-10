/** A single summoned encounter; charge comes only from accepted, watched field kills. */
import { worldBossFor, worldBossDropTable, WORLD_BOSSES } from '../data/worldBosses.ts'
import { ZONES } from '../data/zones.ts'
import { lcData } from '../data/lcSource.ts'
import { ITEMS } from '../data/items.ts'
import type { CharacterData } from './character.ts'
import type { EncounterClock } from './combat.ts'
import { GameError } from './errors.ts'
import { addToInventory, rollSourceDrops, type ItemStack } from './loot.ts'
import { rollInt, type Rng } from './rng.ts'

export interface WorldBossEncounter {
  id: string
  zoneId: string
  monsterId: string
  /** An existing clear hunting ground; the ordinary hunting spot stays saved. */
  arenaMonsterId: string
  summonedAt: number
  combatMs?: number
  combatStarted?: boolean
  assisted?: boolean
}
export type WorldBossOutcome = 'victory' | 'death' | 'left' | 'interrupted'
export interface WorldBossRecord {
  encounterId: string
  zoneId: string
  monsterId: string
  endedAt: number
  /** Null when no offensive action was started (including older saves without a clock). */
  combatMs: number | null
  outcome: WorldBossOutcome
  assisted: boolean
}
export interface WorldBossLoot {
  record: WorldBossRecord
  arenaMonsterId: string
  exp: number
  gold: number
  sp: number
  drops: ItemStack[]
}
export interface WorldBossProgress {
  kills: Partial<Record<string, number>>
  defeated: Partial<Record<string, number>>
  active: WorldBossEncounter | null
  history?: WorldBossRecord[]
  /** Persisted together with the rewards; closing the window only resumes the field. */
  pending?: WorldBossLoot
  devCharges?: string[]
}
export const emptyWorldBossProgress = (): WorldBossProgress => ({
  kills: {},
  defeated: {},
  active: null,
})
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

function sanitizeRecord(raw: unknown): WorldBossRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as WorldBossRecord
  if (
    typeof r.encounterId !== 'string' ||
    !r.encounterId ||
    worldBossFor(r.zoneId)?.monsterId !== r.monsterId ||
    !integer(r.endedAt) ||
    (r.combatMs !== null && !integer(r.combatMs)) ||
    !['victory', 'death', 'left', 'interrupted'].includes(r.outcome)
  )
    return null
  return {
    encounterId: r.encounterId,
    zoneId: r.zoneId,
    monsterId: r.monsterId,
    endedAt: r.endedAt,
    combatMs: r.combatMs,
    outcome: r.outcome,
    assisted: r.assisted === true,
  }
}

export function sanitizeWorldBossProgress(raw: unknown): WorldBossProgress {
  const empty = emptyWorldBossProgress()
  if (!raw || typeof raw !== 'object') return empty
  const value = raw as WorldBossProgress
  for (const boss of WORLD_BOSSES) {
    const kills = value.kills?.[boss.zoneId],
      defeated = value.defeated?.[boss.zoneId]
    if (integer(kills)) empty.kills[boss.zoneId] = Math.min(kills, boss.killsRequired)
    if (integer(defeated)) empty.defeated[boss.zoneId] = defeated
  }
  const a = value.active
  if (
    a &&
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    integer(a.summonedAt) &&
    worldBossFor(a.zoneId)?.monsterId === a.monsterId &&
    ZONES[a.zoneId]?.monsterIds.includes(a.arenaMonsterId)
  )
    empty.active = {
      id: a.id,
      zoneId: a.zoneId,
      monsterId: a.monsterId,
      arenaMonsterId: a.arenaMonsterId,
      summonedAt: a.summonedAt,
      ...(integer(a.combatMs) ? { combatMs: a.combatMs } : {}),
      ...(a.combatStarted === true ? { combatStarted: true } : {}),
      ...(a.assisted === true ? { assisted: true } : {}),
    }
  if (Array.isArray(value.history)) {
    const seen = new Set<string>()
    const history = value.history.map(sanitizeRecord).filter((r): r is WorldBossRecord => {
      if (!r || seen.has(r.encounterId)) return false
      seen.add(r.encounterId)
      return true
    })
    if (history.length) empty.history = history
  }
  if (Array.isArray(value.devCharges)) {
    const charges = [...new Set(value.devCharges.filter((z) => worldBossFor(z)))]
    if (charges.length) empty.devCharges = charges
  }
  const p = value.pending
  const record = sanitizeRecord(p?.record)
  if (
    p &&
    record?.outcome === 'victory' &&
    empty.history?.some((r) => r.encounterId === record.encounterId) &&
    ZONES[record.zoneId]?.monsterIds.includes(p.arenaMonsterId) &&
    integer(p.exp) &&
    integer(p.gold) &&
    integer(p.sp) &&
    Array.isArray(p.drops)
  ) {
    empty.active = null
    empty.pending = {
      record,
      arenaMonsterId: p.arenaMonsterId,
      exp: p.exp,
      gold: p.gold,
      sp: p.sp,
      drops: p.drops
        .filter((d) => d && integer(d.itemId) && ITEMS[d.itemId] && integer(d.count) && d.count > 0)
        .map(({ itemId, count }) => ({ itemId, count })),
    }
  }
  return empty
}

export function worldBossCharge(character: Pick<CharacterData, 'worldBoss' | 'location'>): number {
  return character.worldBoss?.kills[character.location.zoneId] ?? 0
}

/** Not used by AFK, expeditions or Dungeons: call only after accepting a field report. */
export function chargeWorldBoss(character: CharacterData, kills: number): CharacterData {
  const boss = worldBossFor(character.location.zoneId)
  if (!boss || kills <= 0 || character.worldBoss?.active || character.worldBoss?.pending)
    return character
  const progress = sanitizeWorldBossProgress(character.worldBoss)
  return {
    ...character,
    worldBoss: {
      ...progress,
      kills: {
        ...progress.kills,
        [boss.zoneId]: Math.min(boss.killsRequired, (progress.kills[boss.zoneId] ?? 0) + kills),
      },
    },
  }
}

export function summonWorldBoss(character: CharacterData, id: string, now: number): CharacterData {
  const boss = worldBossFor(character.location.zoneId)
  if (!boss) throw new GameError('no-world-boss')
  if (
    character.expedition ||
    character.dungeons?.active ||
    character.runFrom ||
    character.worldBoss?.pending
  )
    throw new GameError('world-boss-unavailable')
  const progress = sanitizeWorldBossProgress(character.worldBoss)
  if (progress.active) throw new GameError('world-boss-active')
  if ((progress.kills[boss.zoneId] ?? 0) < boss.killsRequired)
    throw new GameError('world-boss-not-ready')
  const arenaMonsterId = character.location.monsterId
  const { devCharges, ...saved } = progress
  const remaining = devCharges?.filter((zone) => zone !== boss.zoneId) ?? []
  return {
    ...character,
    lastPlayedAt: now,
    worldBoss: {
      ...saved,
      ...(remaining.length ? { devCharges: remaining } : {}),
      kills: { ...progress.kills, [boss.zoneId]: 0 },
      active: {
        id,
        zoneId: boss.zoneId,
        monsterId: boss.monsterId,
        arenaMonsterId,
        summonedAt: now,
        combatMs: 0,
        ...(devCharges?.includes(boss.zoneId) ? { assisted: true } : {}),
      },
    },
  }
}

export function endWorldBoss(
  character: CharacterData,
  outcome: WorldBossOutcome,
  now: number,
): CharacterData {
  const progress = sanitizeWorldBossProgress(character.worldBoss)
  if (!progress.active) return character
  const zoneId = progress.active.zoneId
  const record: WorldBossRecord = {
    encounterId: progress.active.id,
    zoneId,
    monsterId: progress.active.monsterId,
    endedAt: now,
    combatMs: progress.active.combatStarted ? (progress.active.combatMs ?? 0) : null,
    assisted: progress.active.assisted === true,
    outcome,
  }
  return {
    ...character,
    worldBoss: {
      ...progress,
      active: null,
      history: [...(progress.history ?? []), record],
      defeated:
        outcome === 'victory'
          ? { ...progress.defeated, [zoneId]: (progress.defeated[zoneId] ?? 0) + 1 }
          : progress.defeated,
    },
  }
}

/** Combat's clock excludes travel, spawning and approach, and only advances in visible simulation. */
export function recordWorldBossTime(
  character: CharacterData,
  clock?: EncounterClock,
  assisted = false,
): CharacterData {
  const active = character.worldBoss?.active
  if (!active) return character
  if (
    clock &&
    (!Number.isFinite(clock.seconds) ||
      clock.seconds < 0 ||
      !Number.isSafeInteger(Math.round(clock.seconds * 1000)) ||
      typeof clock.started !== 'boolean' ||
      typeof clock.assisted !== 'boolean' ||
      (!clock.started && clock.seconds > 0))
  )
    throw new GameError('invalid-world-boss-time')
  return {
    ...character,
    worldBoss: {
      ...character.worldBoss!,
      active: {
        ...active,
        combatMs: Math.max(active.combatMs ?? 0, clock ? Math.round(clock.seconds * 1000) : 0),
        combatStarted: active.combatStarted === true || clock?.started === true,
        assisted: active.assisted === true || assisted || clock?.assisted === true,
      },
    },
  }
}

/** Developer tool: it never changes ordinary kill totals or a different map's charge. */
export function fillWorldBossCharge(character: CharacterData): CharacterData {
  if (
    character.worldBoss?.active ||
    character.worldBoss?.pending ||
    character.expedition ||
    character.dungeons?.active
  )
    throw new GameError('world-boss-unavailable')
  const boss = worldBossFor(character.location.zoneId)
  if (!boss) throw new GameError('no-world-boss')
  const c = chargeWorldBoss(character, boss.killsRequired)
  return {
    ...c,
    worldBoss: {
      ...c.worldBoss!,
      devCharges: [...new Set([...(c.worldBoss?.devCharges ?? []), boss.zoneId])],
    },
  }
}

/** Source independent rolls with the owner's explicit loot changes; no drop bonus of any kind. */
export function worldBossDrops(monster: { id: string }, rng: Rng): ItemStack[] {
  const boss = WORLD_BOSSES.find((b) => b.monsterId === monster.id)
  if (!boss) throw new GameError('no-world-boss')
  const raid = worldBossDropTable(boss)
    .filter((d) => rollInt(rng, 1, 10000) <= d.probability)
    .map((d) => ({ itemId: d.item, count: d.count }))
  // Keep the raw source slots, including equipment for classes not yet playable here.
  const regular = lcData?.monsters.find((m) => m.id === boss.monsterId)?.dropSlots
  let ended = false
  const slots = regular?.map((drop) => {
    if (drop.item < 0) ended = true
    return ended ? null : { itemId: drop.item, chance: drop.chance }
  })
  const drops = slots ? addToInventory(raid, rollSourceDrops(slots, 1, rng)) : raid
  return drops.sort((a, b) => a.itemId - b.itemId)
}
