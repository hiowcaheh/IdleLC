import { describe, expect, it } from 'vitest'
import { findPath, isWalkable, pathLength, pointAlong, type NavGrid } from './navigation.ts'

/** A grid from rows of '.' (walkable) and '#' (blocked), 1 m cells. */
function grid(rows: string[]): NavGrid {
  const width = rows[0]!.length
  const height = rows.length
  const bits = new Uint8Array(Math.ceil((width * height) / 8))
  rows.forEach((row, j) =>
    [...row].forEach((c, i) => {
      const k = j * width + i
      if (c === '.') bits[k >> 3]! |= 1 << (k & 7)
    }),
  )
  return { width, height, cell: 1, bits }
}

describe('navigation', () => {
  it('reads the walkable bits', () => {
    const nav = grid(['.#', '#.'])
    expect(isWalkable(nav, 0, 0)).toBe(true)
    expect(isWalkable(nav, 1, 0)).toBe(false)
    expect(isWalkable(nav, 1, 1)).toBe(true)
    expect(isWalkable(nav, 2, 0)).toBe(false)
  })

  it('runs straight over open ground', () => {
    const nav = grid(['.....', '.....', '.....'])
    const path = findPath(nav, [0.5, 0.5], [4.5, 2.5])
    expect(path).toEqual([
      [0.5, 0.5],
      [4.5, 2.5],
    ])
    expect(pathLength(path)).toBeCloseTo(Math.hypot(4, 2))
  })

  it('goes around a wall instead of through it', () => {
    const nav = grid(['.......', '...#...', '...#...', '...#...', '.......'])
    const path = findPath(nav, [1.5, 2.5], [5.5, 2.5])
    expect(path.length).toBeGreaterThan(2)
    expect(pathLength(path)).toBeGreaterThan(4)
    // every leg stays on walkable cells
    for (let k = 1; k < path.length; k++) {
      const [ax, az] = path[k - 1]!
      const [bx, bz] = path[k]!
      for (let t = 0; t <= 1; t += 0.05) {
        const x = ax + (bx - ax) * t
        const z = az + (bz - az) * t
        expect(isWalkable(nav, Math.floor(x), Math.floor(z))).toBe(true)
      }
    }
  })

  it('crosses blocked ground only where there is no other way, at its narrowest', () => {
    const nav = grid(['..#..', '..#..', '.....'.replace(/./g, (c, i) => (i === 2 ? '#' : c))])
    const path = findPath(nav, [0.5, 0.5], [4.5, 0.5])
    expect(path[0]).toEqual([0.5, 0.5])
    expect(path[path.length - 1]).toEqual([4.5, 0.5])
    expect(pathLength(path)).toBeLessThan(8)
  })

  it('finds the point and the heading along a path', () => {
    const path = [
      [0, 0],
      [0, 10],
      [10, 10],
    ] as const
    expect(pointAlong(path, 5)).toEqual({ at: [0, 5], yaw: 0 })
    const turn = pointAlong(path, 15)
    expect(turn.at[0]).toBeCloseTo(5)
    expect(turn.at[1]).toBeCloseTo(10)
    expect(turn.yaw).toBeCloseTo(Math.PI / 2)
    expect(pointAlong(path, 99).at).toEqual([10, 10])
    expect(pointAlong(path, -3).at).toEqual([0, 0])
  })
})
