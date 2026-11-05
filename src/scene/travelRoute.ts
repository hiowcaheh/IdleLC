/**
 * The hero's run to another hunting spot on a zone drawn on the client's map: planned when the
 * player picks the spot (its length sets how long the run takes, combat.ts), drawn by the map
 * sliding along it under the hero (World.tsx MapGround).
 */
import { MONSTERS } from '../game/data/monsters.ts'
import { ZONES } from '../game/data/zones.ts'
import { findPath, pathLength, type MapPoint } from '../game/logic/navigation.ts'
import { zoneSpots } from '../game/logic/spots.ts'
import { huntingGround, loadedMap, type TerrainMeta } from './lcMap.ts'

export interface TravelRoute {
  map: string
  /** The way in map metres, where the map stood first, the new hunting ground last. */
  points: MapPoint[]
  /** Metres along it. */
  length: number
}

/** The run being drawn (null: none planned on a map yet). */
let route: TravelRoute | null = null
/** The point of the map under the hero now, written by the scene every frame. */
const shown: { map: string | null; at: MapPoint | null } = { map: null, at: null }

export function currentRoute(): TravelRoute | null {
  return route
}

/** The scene's report of where the map stands under the hero. */
export function setShownGround(map: string, at: MapPoint): void {
  shown.map = map
  shown.at = at
}

/** Where a monster of a zone is hunted on the zone's map. */
export function groundOf(meta: TerrainMeta, zoneId: string, monsterId: string): [number, number] {
  return huntingGround(
    meta,
    MONSTERS[monsterId]?.spawns?.[zoneId],
    zoneSpots(zoneId).indexOf(monsterId),
  )
}

/**
 * Plans the run to `monsterId` in `zoneId` from where the map stands now: the route around what
 * can't be crossed, and its metres. Undefined when there is nothing to plan on (another zone, a
 * zone without a map, the map not fetched yet): the run then keeps its short default.
 */
export function planTravel(zoneId: string, monsterId: string): number | undefined {
  const map = ZONES[zoneId]?.map
  const data = map ? loadedMap(map) : null
  if (!map || !data || shown.map !== map || !shown.at) {
    route = null
    return undefined
  }
  const to = groundOf(data.meta, zoneId, monsterId)
  const points = data.nav ? findPath(data.nav, shown.at, to) : [shown.at, to]
  route = { map, points, length: pathLength(points) }
  return route.length
}
