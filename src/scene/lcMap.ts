/**
 * A map's terrain from the client (public/maps/<map>/, written by `npm run convert-lc -- --only
 * terrain`): its description, heights and hunting grounds.
 */
import { smoothstep } from './terrain.ts'

/** public/maps/<map>/terrain.json (scripts/lc/terrain.mjs). */
export interface TerrainMeta {
  width: number
  height: number
  /** Metres per height-map cell. */
  cell: number
  /** Metres per height unit (heights.bin holds u16 values). */
  heightScale: number
  /** Texture layers in drawing order; `tile`: metres one texture repeat covers. */
  layers: { texture: string; tile: number }[]
  /** Masks of layers 1…, four per RGBA sheet. */
  masks: string[]
  /** Hunting grounds [x, z] in map metres, nearest the town first. */
  arenas: [number, number][]
}

export interface LcMap {
  meta: TerrainMeta
  heights: Uint16Array
}

export const mapBase = (map: string) => `${import.meta.env.BASE_URL}maps/${map}/`
const maps = new Map<string, Promise<LcMap>>()

/** The map's description and heights, fetched once. */
export function loadMap(map: string): Promise<LcMap> {
  let promise = maps.get(map)
  if (!promise) {
    promise = Promise.all([
      fetch(`${mapBase(map)}terrain.json`).then((r) => r.json() as Promise<TerrainMeta>),
      fetch(`${mapBase(map)}heights.bin`).then((r) => r.arrayBuffer()),
    ]).then(([meta, buffer]) => ({ meta, heights: new Uint16Array(buffer) }))
    maps.set(map, promise)
  }
  return promise
}

/** Map height in metres at a point (bilinear). */
export function mapHeight({ meta, heights }: LcMap, x: number, z: number): number {
  const fx = Math.min(meta.width - 1.001, Math.max(0, x / meta.cell))
  const fz = Math.min(meta.height - 1.001, Math.max(0, z / meta.cell))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const h = (a: number, b: number) => heights[b * meta.width + a]! * meta.heightScale
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * (fx - i)
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * (fx - i)
  return top + (bottom - top) * (fz - j)
}

/** The fight's ground: level inside, blending into the map's own shape further out. */
const LEVEL_RADIUS = 9
const BLEND_RADIUS = 20

/**
 * Height of the drawn ground at a point around the fight (scene coordinates: the arena's centre at
 * the origin, its ground at y = 0).
 */
export function groundHeight(map: LcMap, centre: [number, number], x: number, z: number): number {
  const h0 = mapHeight(map, centre[0], centre[1])
  const y = mapHeight(map, centre[0] + x, centre[1] + z) - h0
  return y * smoothstep(LEVEL_RADIUS, BLEND_RADIUS, Math.hypot(x, z))
}
