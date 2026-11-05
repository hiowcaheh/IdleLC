/**
 * Runs between hunting spots: the shortest way over a map's walkable grid (public/maps/<map>/nav.bin,
 * scripts/lc/nav.mjs) — around trees, rocks, houses, cliffs and water — and points along it.
 * Pure functions: the scene draws the run, the fight's logic only needs its length.
 */

/** A map's walkable grid: `cell` metres a cell, `bits` one bit a cell (1 = walkable), rows along z. */
export interface NavGrid {
  width: number
  height: number
  cell: number
  bits: Uint8Array
}

/** A point of the map in metres: [x, z]. */
export type MapPoint = readonly [number, number]

/**
 * Cost of a metre over ground nobody can walk: when a spot can't be reached any other way (a river
 * without a bridge on the grid) the run crosses the narrowest stretch rather than nowhere.
 */
const BLOCKED_COST = 40
/** Searches give up after this many cells and run straight (a broken grid must not freeze the game). */
const MAX_VISITS = 400_000

export function isWalkable(nav: NavGrid, i: number, j: number): boolean {
  if (i < 0 || j < 0 || i >= nav.width || j >= nav.height) return false
  const k = j * nav.width + i
  return ((nav.bits[k >> 3]! >> (k & 7)) & 1) === 1
}

const cellOf = (nav: NavGrid, [x, z]: MapPoint): [number, number] => [
  Math.min(nav.width - 1, Math.max(0, Math.floor(x / nav.cell))),
  Math.min(nav.height - 1, Math.max(0, Math.floor(z / nav.cell))),
]

/** Is the straight line between two points over walkable cells only? */
function clearLine(nav: NavGrid, a: MapPoint, b: MapPoint): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const steps = Math.max(1, Math.ceil(length / (nav.cell / 3)))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const [i, j] = cellOf(nav, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    if (!isWalkable(nav, i, j)) return false
  }
  return true
}

/** A binary heap of cell indexes by their score (A*'s open list). */
class Heap {
  private items: number[] = []
  private readonly score: Float64Array
  constructor(score: Float64Array) {
    this.score = score
  }
  get size(): number {
    return this.items.length
  }
  push(k: number): void {
    const a = this.items
    a.push(k)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.score[a[p]!]! <= this.score[k]!) break
      a[i] = a[p]!
      i = p
    }
    a[i] = k
  }
  pop(): number {
    const a = this.items
    const top = a[0]!
    const last = a.pop()!
    if (a.length > 0) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        if (l >= a.length) break
        const r = l + 1
        const c = r < a.length && this.score[a[r]!]! < this.score[a[l]!]! ? r : l
        if (this.score[a[c]!]! >= this.score[last]!) break
        a[i] = a[c]!
        i = c
      }
      a[i] = last
    }
    return top
  }
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

/**
 * The way from `from` to `to` over the grid: A* over the cells (8 directions, no cutting a blocked
 * corner, blocked cells very dear but not closed), then straightened where the line stays on
 * walkable ground. Points in metres, `from` first and `to` last.
 */
export function findPath(nav: NavGrid, from: MapPoint, to: MapPoint): MapPoint[] {
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 1e-6) return [from, to]
  if (clearLine(nav, from, to)) return [from, to]
  const [si, sj] = cellOf(nav, from)
  const [gi, gj] = cellOf(nav, to)
  const n = nav.width * nav.height
  const start = sj * nav.width + si
  const goal = gj * nav.width + gi
  const cost = new Float64Array(n).fill(Infinity)
  const score = new Float64Array(n)
  const parent = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const heuristic = (i: number, j: number) => {
    const dx = Math.abs(i - gi)
    const dz = Math.abs(j - gj)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
  }
  cost[start] = 0
  score[start] = heuristic(si, sj)
  const open = new Heap(score)
  open.push(start)
  let visits = 0
  let found = false
  while (open.size > 0) {
    const k = open.pop()
    if (closed[k]) continue
    if (k === goal) {
      found = true
      break
    }
    if (++visits > MAX_VISITS) break
    closed[k] = 1
    const i = k % nav.width
    const j = (k - i) / nav.width
    const here = isWalkable(nav, i, j)
    for (const [di, dj, step] of NEIGHBOURS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= nav.width || nj >= nav.height) continue
      const nk = nj * nav.width + ni
      if (closed[nk]) continue
      const there = isWalkable(nav, ni, nj)
      // a diagonal step between walkable cells may not squeeze past a blocked corner
      if (di !== 0 && dj !== 0 && here && there) {
        if (!isWalkable(nav, i + di, j) || !isWalkable(nav, i, j + dj)) continue
      }
      const g = cost[k]! + step * (there ? 1 : BLOCKED_COST)
      if (g >= cost[nk]!) continue
      cost[nk] = g
      parent[nk] = k
      score[nk] = g + heuristic(ni, nj)
      open.push(nk)
    }
  }
  if (!found) return [from, to]
  const cells: MapPoint[] = []
  for (let k = parent[goal]!; k !== -1 && k !== start; k = parent[k]!) {
    const i = k % nav.width
    cells.push([(i + 0.5) * nav.cell, ((k - i) / nav.width + 0.5) * nav.cell])
  }
  cells.reverse()
  return straighten(nav, [from, ...cells, to])
}

/** Drops the corners a straight walkable line can skip (string pulling). */
function straighten(nav: NavGrid, points: MapPoint[]): MapPoint[] {
  const out: MapPoint[] = [points[0]!]
  let anchor = 0
  while (anchor < points.length - 1) {
    let next = anchor + 1
    for (let k = points.length - 1; k > anchor + 1; k--) {
      if (clearLine(nav, points[anchor]!, points[k]!)) {
        next = k
        break
      }
    }
    out.push(points[next]!)
    anchor = next
  }
  return out
}

/** Metres along a path. */
export function pathLength(path: readonly MapPoint[]): number {
  let length = 0
  for (let k = 1; k < path.length; k++)
    length += Math.hypot(path[k]![0] - path[k - 1]![0], path[k]![1] - path[k - 1]![1])
  return length
}

/**
 * Where a runner is `metres` along the path: the point and the way it faces there (radians, the
 * scene's yaw: atan2(dx, dz)).
 */
export function pointAlong(
  path: readonly MapPoint[],
  metres: number,
): { at: [number, number]; yaw: number } {
  let left = Math.max(0, metres)
  for (let k = 1; k < path.length; k++) {
    const [ax, az] = path[k - 1]!
    const [bx, bz] = path[k]!
    const length = Math.hypot(bx - ax, bz - az)
    if (length < 1e-9) continue
    const yaw = Math.atan2(bx - ax, bz - az)
    if (left <= length || k === path.length - 1) {
      const t = Math.min(1, left / length)
      return { at: [ax + (bx - ax) * t, az + (bz - az) * t], yaw }
    }
    left -= length
  }
  const last = path[path.length - 1] ?? [0, 0]
  return { at: [last[0], last[1]], yaw: 0 }
}
