/** A single summoned encounter; charge comes only from accepted, watched field kills. */
import { worldBossFor, WORLD_BOSSES } from '../data/worldBosses.ts'
import { ZONES } from '../data/zones.ts'
import { lcData } from '../data/lcSource.ts'
import type { CharacterData } from './character.ts'
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
}
export interface WorldBossProgress {
  kills: Partial<Record<string, number>>
  defeated: Partial<Record<string, number>>
  active: WorldBossEncounter | null
}
export const emptyWorldBossProgress = (): WorldBossProgress => ({
  kills: {},
  defeated: {},
  active: null,
})
const integer = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

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
    }
  return empty
}

export function worldBossCharge(character: Pick<CharacterData, 'worldBoss' | 'location'>): number {
  return character.worldBoss?.kills[character.location.zoneId] ?? 0
}

/** Not used by AFK, expeditions or Dungeons: call only after accepting a field report. */
export function chargeWorldBoss(character: CharacterData, kills: number): CharacterData {
  const boss = worldBossFor(character.location.zoneId)
  if (!boss || kills <= 0 || character.worldBoss?.active) return character
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
  if (character.expedition || character.dungeons?.active || character.runFrom)
    throw new GameError('world-boss-unavailable')
  const progress = sanitizeWorldBossProgress(character.worldBoss)
  if (progress.active) throw new GameError('world-boss-active')
  if ((progress.kills[boss.zoneId] ?? 0) < boss.killsRequired)
    throw new GameError('world-boss-not-ready')
  const spots = ZONES[boss.zoneId]!.monsterIds
  const index = spots.indexOf(character.location.monsterId)
  const arenaMonsterId = spots[(Math.max(0, index) + 1) % spots.length]!
  return {
    ...character,
    lastPlayedAt: now,
    worldBoss: {
      ...progress,
      kills: { ...progress.kills, [boss.zoneId]: 0 },
      active: {
        id,
        zoneId: boss.zoneId,
        monsterId: boss.monsterId,
        arenaMonsterId,
        summonedAt: now,
      },
    },
  }
}

export function endWorldBoss(character: CharacterData, victory = false): CharacterData {
  const progress = sanitizeWorldBossProgress(character.worldBoss)
  if (!progress.active) return character
  const zoneId = progress.active.zoneId
  return {
    ...character,
    worldBoss: {
      ...progress,
      active: null,
      defeated: victory
        ? { ...progress.defeated, [zoneId]: (progress.defeated[zoneId] ?? 0) + 1 }
        : progress.defeated,
    },
  }
}

/** hardcoding.cpp DropRaidMonsterItem: independent rolls, no drop bonus of any kind. */
export function worldBossDrops(monster: { id: string }, rng: Rng): ItemStack[] {
  const boss = WORLD_BOSSES.find((b) => b.monsterId === monster.id)
  if (!boss) throw new GameError('no-world-boss')
  const raid = boss.raidDrops
    .filter((d) => rollInt(rng, 1, 10000) <= d.probability)
    .map((d) => ({ itemId: d.item, count: d.count }))
  // Keep the raw source slots, including equipment for classes not yet playable here.
  const regular = lcData?.monsters.find((m) => m.id === boss.monsterId)?.dropSlots
  let ended = false
  const slots = regular?.map((drop) => {
    if (drop.item < 0) ended = true
    return ended ? null : { itemId: drop.item, chance: drop.chance }
  })
  return slots ? addToInventory(raid, rollSourceDrops(slots, 1, rng)) : raid
}
