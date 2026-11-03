/**
 * Hunting spots: a zone's monsters in hunting order (data/zones.ts, lowest level first). A character
 * starts every zone at its first spot; killing the monster of the farthest open spot opens the next
 * one. Pure — the server checks travel with the same rules.
 */
import { ZONES } from '../data/zones.ts'
import type { CharacterData, CharacterLocation, CharacterStats } from './character.ts'

export function zoneSpots(zoneId: string): readonly string[] {
  return ZONES[zoneId]?.monsterIds ?? []
}

/** Cities follow hunting progression: defeat the previous region's final hunting monster. */
export function previousZone(zoneId: string) {
  const zones = Object.values(ZONES).sort((a, b) => a.minLevel - b.minLevel)
  const index = zones.findIndex((zone) => zone.id === zoneId)
  return index > 0 ? zones[index - 1] : undefined
}

export function isZoneOpen(character: Pick<CharacterData, 'stats'>, zoneId: string): boolean {
  if (!ZONES[zoneId]) return false
  const previous = previousZone(zoneId)
  const last = previous?.monsterIds.at(-1)
  return !previous || (last !== undefined && (character.stats.monsterKills[last] ?? 0) > 0)
}

/** How many spots of the zone are open (at least the first). */
export function openSpotCount(
  character: Pick<CharacterData, 'reachedSpots'>,
  zoneId: string,
): number {
  const spots = zoneSpots(zoneId)
  const reached = character.reachedSpots[zoneId]
  const index = reached === undefined ? -1 : spots.indexOf(reached)
  return Math.min(spots.length, Math.max(1, index + 1))
}

export function isSpotOpen(
  character: Pick<CharacterData, 'reachedSpots'>,
  location: CharacterLocation,
): boolean {
  const index = zoneSpots(location.zoneId).indexOf(location.monsterId)
  return index >= 0 && index < openSpotCount(character, location.zoneId)
}

/** The farthest open spot of a zone (where a trip there goes). */
export function farthestSpot(
  character: Pick<CharacterData, 'reachedSpots'>,
  zoneId: string,
): string | undefined {
  return zoneSpots(zoneId)[openSpotCount(character, zoneId) - 1]
}

/**
 * Counts `kills` of a monster at a spot of the zone in the stats and the monster book; a kill at the
 * farthest open spot opens the next one.
 */
export function recordKills(
  character: Pick<CharacterData, 'stats' | 'reachedSpots'>,
  location: CharacterLocation,
  kills: number,
  deaths: number,
): Pick<CharacterData, 'stats' | 'reachedSpots'> {
  const { monsterId, zoneId } = location
  const stats: CharacterStats = {
    ...character.stats,
    kills: character.stats.kills + kills,
    deaths: character.stats.deaths + deaths,
    monsterKills:
      kills > 0
        ? {
            ...character.stats.monsterKills,
            [monsterId]: (character.stats.monsterKills[monsterId] ?? 0) + kills,
          }
        : character.stats.monsterKills,
  }
  const spots = zoneSpots(zoneId)
  const index = spots.indexOf(monsterId)
  const opensNext =
    kills > 0 &&
    index >= 0 &&
    index + 1 === openSpotCount(character, zoneId) &&
    index + 1 < spots.length
  return {
    stats,
    reachedSpots: opensNext
      ? { ...character.reachedSpots, [zoneId]: spots[index + 1]! }
      : character.reachedSpots,
  }
}
