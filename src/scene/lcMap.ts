/**
 * A map's terrain from the client (public/maps/<map>/, written by `npm run convert-lc -- --only
 * terrain`): its description, heights and hunting grounds.
 */
import type { NavGrid } from '../game/logic/navigation.ts'
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
  /**
   * Hunting grounds [x, z] in map metres in spot order: the monsters' spawn points where the spawn
   * table fits the map (Dratan, Merac, Egeha), else picked on clear ground near the town first.
   */
  arenas: [number, number][]
  /** True when the arenas are the spawn table's points: each monster is hunted at its own. */
  spawns?: boolean
  /** The walkable grid (nav.bin, scripts/lc/nav.mjs) for the runs between spots. */
  nav?: { file: string; cell: number; width: number; height: number }
}

export interface LcMap {
  meta: TerrainMeta
  /** Heights in metres, row by row along z, the hunting grounds levelled. */
  ground: Float32Array
  /** The client's own heights in metres (what the world file's props stand on). */
  raw: Float32Array
  /** Where the hero can run (null: the map has no grid; runs go straight). */
  nav: NavGrid | null
}

/**
 * public/maps/<map>/props.json (scripts/lc/props.mjs): the models of props.glb (node names; `low`:
 * grass and flowers) and where the world file places them: [model, x, y, z, heading, pitch, banking,
 * stretch (one number when even, else x, y, z)], angles in degrees.
 */
export interface MapProps {
  models: { id: string; low: boolean }[]
  instances: number[][]
}

export const mapBase = (map: string) => `${import.meta.env.BASE_URL}maps/${map}/`
/**
 * Changed whenever a converter run rewrites a map's description, props or walkable grid: the
 * service worker answers from its cache first, so a new address makes the next start fetch them.
 */
const MAP_REVISION = '2026-11-05-spawns'
/** A map file that converter runs rewrite (terrain.json, props, nav.bin), with the revision. */
export const mapFile = (map: string, name: string) => `${mapBase(map)}${name}?v=${MAP_REVISION}`
const maps = new Map<string, Promise<LcMap>>()
/** Maps already fetched, for what needs them at once (planning a run). */
const loaded = new Map<string, LcMap>()

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
      fetch(mapFile(map, 'terrain.json')).then((r) => r.json() as Promise<TerrainMeta>),
      fetch(`${mapBase(map)}heights.bin`).then((r) => r.arrayBuffer()),
    ]).then(async ([meta, buffer]) => {
      const heights = new Uint16Array(buffer)
      const data: LcMap = {
        meta,
        ground: levelledGround(meta, heights),
        raw: Float32Array.from(heights, (h) => h * meta.heightScale),
        nav: await loadNav(map, meta),
      }
      loaded.set(map, data)
      return data
    })
    maps.set(map, promise)
  }
  return promise
}

/** The map's walkable grid; null without one (or when it can't be read: runs go straight). */
async function loadNav(map: string, meta: TerrainMeta): Promise<NavGrid | null> {
  if (!meta.nav) return null
  const { file, cell, width, height } = meta.nav
  try {
    const response = await fetch(mapFile(map, file))
    if (!response.ok) return null
    const bits = new Uint8Array(await response.arrayBuffer())
    return bits.length >= Math.ceil((width * height) / 8) ? { width, height, cell, bits } : null
  } catch {
    return null
  }
}

/** The map when it has been fetched already, else null. */
export function loadedMap(map: string): LcMap | null {
  return loaded.get(map) ?? null
}

/**
 * Where a monster is hunted on its zone's map: its spawn point when the map's hunting grounds are
 * the spawn table's (Dratan, Merac, Egeha), else the map's hunting ground of its spot (Juno).
 */
export function huntingGround(
  meta: TerrainMeta,
  spawn: readonly [number, number] | undefined,
  spot: number,
): [number, number] {
  if (meta.spawns && spawn) return [spawn[0], spawn[1]]
  return meta.arenas[Math.max(0, spot) % meta.arenas.length]!
}

const props = new Map<string, Promise<MapProps | null>>()

/** The map's props (null when the map has none), fetched once. */
export function loadProps(map: string): Promise<MapProps | null> {
  let promise = props.get(map)
  if (!promise) {
    promise = fetch(mapFile(map, 'props.json'))
      .then((r) => (r.ok ? (r.json() as Promise<MapProps>) : null))
      .catch(() => null)
    props.set(map, promise)
  }
  return promise
}

/** Height in metres at a point of the map (bilinear between the height map's vertices). */
function sample(meta: TerrainMeta, heights: Float32Array, x: number, z: number): number {
  const fx = Math.min(meta.width - 1.001, Math.max(0, x / meta.cell))
  const fz = Math.min(meta.height - 1.001, Math.max(0, z / meta.cell))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const h = (a: number, b: number) => heights[b * meta.width + a]!
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * (fx - i)
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * (fx - i)
  return top + (bottom - top) * (fz - j)
}

/** Ground height in metres at a point of the map (the hunting grounds levelled). */
export const groundHeight = (map: LcMap, x: number, z: number) => sample(map.meta, map.ground, x, z)

/** How far a hunting ground's levelling raised (+) or lowered (−) the client's ground here. */
export const levelShift = (map: LcMap, x: number, z: number) =>
  sample(map.meta, map.ground, x, z) - sample(map.meta, map.raw, x, z)
