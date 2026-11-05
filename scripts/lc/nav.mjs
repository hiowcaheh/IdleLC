/**
 * Where a hero can walk on a map, for the runs between hunting spots (src/game/logic/navigation.ts):
 * a grid of NAV_CELL-metre cells, one bit each (1 = walkable), written as public/maps/<map>/nav.bin.
 *
 * The client's attribute map (`<map>_<w>_<h>_<layer>.sat`, one byte per metre, rows along z) is the
 * source: 255 marks ground nobody can stand on (trees, rocks, walls, water, cliffs; the server's
 * MATT_UNWALKABLE), other values are walkable areas (0 open ground, 10 town, 60 castle grounds…).
 * Maps without one fall back to the terrain's slope and the world file's trees and buildings.
 */
import { LOW_PROP } from './props.mjs'
import { coverage, heightAt } from './terrain.mjs'

/** Metres a nav cell covers. */
export const NAV_CELL = 4
/** The attribute map's value for ground nobody can stand on. */
const SAT_UNWALKABLE = 255
/** A cell is walkable when at least this share of its metres is (a gap between two trees is). */
const WALKABLE_SHARE = 0.5
/** Without an attribute map: steepest rise (metres) between neighbouring nav cells. */
const MAX_RISE = 3
/** Trees and cacti: only the trunk blocks the way (the crown's box would close whole groves). */
const TRUNK = /tree|palm|coconut|cactus/i
/** Bushes, grass and flowers, however tall: the hero walks through them. */
const UNDERGROWTH = /plant|grass|herb|bush|flower/i
/** Props wider than this (box radius, metres) block nothing in the fallback. */
const HUGE_PROP = 40
/** Without an attribute map: a cell this much covered by a water layer is water. */
const WET = 0.5
/** Metres a trunk blocks around its model's origin (one nav cell at least). */
const TRUNK_RADIUS = 3

/**
 * Without an attribute map: what blocks the way among the world file's placed models
 * (scripts/lc/props.mjs placedModels), as [x, z, radius] in map metres. Trunks block their cell,
 * rocks, walls and houses most of their box; grass and bushes nothing.
 */
export function navObstacles(placed) {
  const out = []
  for (const p of placed) {
    if (!p.box || p.box[1] < LOW_PROP || UNDERGROWTH.test(p.id)) continue
    const radius = Math.hypot(p.box[0], p.box[2]) / 2
    // ground pieces, long walls and whole compounds: their box is no footprint
    if (radius > HUGE_PROP) continue
    out.push([p.x, p.z, TRUNK.test(p.id) ? TRUNK_RADIUS : radius * 0.8])
  }
  return out
}

/**
 * The walkable grid of a map whose terrain is `size` metres a side: from the attribute map
 * (`sat`: its bytes, `satSize` metres a side) or, without one, from `terrain`: its slope, its
 * `waterLayers` (texture layers that are water) and the `obstacles` ([x, z, radius], navObstacles;
 * a cell whose centre is within an obstacle's radius is blocked).
 * Returns { width, height, cell, bits, walkable }.
 */
export function buildNav({
  size,
  sat = null,
  satSize = 0,
  terrain = null,
  waterLayers = [],
  obstacles = [],
}) {
  const width = Math.floor(size / NAV_CELL)
  const height = width
  const walkable = new Uint8Array(width * height)
  if (sat) {
    const scale = satSize / size
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        let open = 0
        let total = 0
        const x0 = Math.floor(i * NAV_CELL * scale)
        const z0 = Math.floor(j * NAV_CELL * scale)
        const span = Math.max(1, Math.round(NAV_CELL * scale))
        for (let z = z0; z < Math.min(satSize, z0 + span); z++) {
          for (let x = x0; x < Math.min(satSize, x0 + span); x++) {
            total++
            if (sat[z * satSize + x] !== SAT_UNWALKABLE) open++
          }
        }
        walkable[j * width + i] = total > 0 && open / total >= WALKABLE_SHARE ? 1 : 0
      }
    }
  } else {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const x = (i + 0.5) * NAV_CELL
        const z = (j + 0.5) * NAV_CELL
        const h = heightAt(terrain, x, z)
        const rise = Math.max(
          Math.abs(heightAt(terrain, x + NAV_CELL, z) - h),
          Math.abs(heightAt(terrain, x, z + NAV_CELL) - h),
        )
        const wet = waterLayers.some((k) => coverage(terrain.layers[k], size, x, z) >= WET)
        walkable[j * width + i] = rise <= MAX_RISE && !wet ? 1 : 0
      }
    }
    for (const [ox, oz, r] of obstacles) {
      const reach = Math.ceil(r / NAV_CELL)
      const ci = Math.floor(ox / NAV_CELL)
      const cj = Math.floor(oz / NAV_CELL)
      for (let j = cj - reach; j <= cj + reach; j++) {
        for (let i = ci - reach; i <= ci + reach; i++) {
          if (i < 0 || j < 0 || i >= width || j >= height) continue
          const dx = (i + 0.5) * NAV_CELL - ox
          const dz = (j + 0.5) * NAV_CELL - oz
          if (Math.hypot(dx, dz) <= r) walkable[j * width + i] = 0
        }
      }
    }
  }
  // the map's edge is not walkable
  for (let k = 0; k < width; k++) {
    walkable[k] = 0
    walkable[(height - 1) * width + k] = 0
    walkable[k * width] = 0
    walkable[k * width + width - 1] = 0
  }
  const bits = Buffer.alloc(Math.ceil((width * height) / 8))
  walkable.forEach((v, k) => {
    if (v) bits[k >> 3] |= 1 << (k & 7)
  })
  return { width, height, cell: NAV_CELL, bits, walkable }
}

/** Share of the hunting grounds standing on walkable cells (a check that the grid lines up). */
export function walkableShare(nav, points) {
  if (points.length === 0) return 1
  const ok = points.filter(([x, z]) => {
    const i = Math.floor(x / nav.cell)
    const j = Math.floor(z / nav.cell)
    return nav.walkable[j * nav.width + i] === 1
  })
  return ok.length / points.length
}
