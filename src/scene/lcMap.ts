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
  /** Heights in metres, row by row along z, the hunting grounds levelled. */
  ground: Float32Array
}

export const mapBase = (map: string) => `${import.meta.env.BASE_URL}maps/${map}/`
const maps = new Map<string, Promise<LcMap>>()

/** The fight's ground: level inside, blending into the map's own shape further out (metres). */
const LEVEL_RADIUS = 12
const BLEND_RADIUS = 24

/**
 * The map's heights in metres with every hunting ground levelled at its centre's height (the
 * fighters stand on flat ground; the rest keeps the client's shape).
 */
function levelledGround(meta: TerrainMeta, raw: Uint16Array): Float32Array {
  const ground = Float32Array.from(raw, (h) => h * meta.heightScale)
  const at = (i: number, j: number) => raw[j * meta.width + i]! * meta.heightScale
  for (const [cx, cz] of meta.arenas) {
    const h0 = at(Math.round(cx / meta.cell), Math.round(cz / meta.cell))
    const reach = Math.ceil(BLEND_RADIUS / meta.cell)
    const ci = Math.round(cx / meta.cell)
    const cj = Math.round(cz / meta.cell)
    for (let j = Math.max(0, cj - reach); j <= Math.min(meta.height - 1, cj + reach); j++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(meta.width - 1, ci + reach); i++) {
        const blend = smoothstep(
          LEVEL_RADIUS,
          BLEND_RADIUS,
          Math.hypot(i * meta.cell - cx, j * meta.cell - cz),
        )
        const k = j * meta.width + i
        ground[k] = h0 + (ground[k]! - h0) * blend
      }
    }
  }
  return ground
}

/** The map's description and levelled heights, fetched once. */
export function loadMap(map: string): Promise<LcMap> {
  let promise = maps.get(map)
  if (!promise) {
    promise = Promise.all([
      fetch(`${mapBase(map)}terrain.json`).then((r) => r.json() as Promise<TerrainMeta>),
      fetch(`${mapBase(map)}heights.bin`).then((r) => r.arrayBuffer()),
    ]).then(([meta, buffer]) => ({ meta, ground: levelledGround(meta, new Uint16Array(buffer)) }))
    maps.set(map, promise)
  }
  return promise
}

/** Ground height in metres at a point of the map (bilinear between the height map's vertices). */
export function groundHeight({ meta, ground }: LcMap, x: number, z: number): number {
  const fx = Math.min(meta.width - 1.001, Math.max(0, x / meta.cell))
  const fz = Math.min(meta.height - 1.001, Math.max(0, z / meta.cell))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const h = (a: number, b: number) => ground[b * meta.width + a]!
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * (fx - i)
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * (fx - i)
  return top + (bottom - top) * (fz - j)
}
