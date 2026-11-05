import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import type { LcMap } from './lcMap.ts'
import { terrainGeometries } from './lcTerrainGeometry.ts'

function map(width: number, height: number): LcMap {
  const ground = Float32Array.from(
    { length: width * height },
    (_, n) => Math.sin((n % width) / 12) * 3 + Math.cos(Math.floor(n / width) / 17) * 2,
  )
  return {
    meta: { width, height, cell: 6, heightScale: 1, layers: [], masks: [], arenas: [] },
    ground,
    raw: ground,
    nav: null,
  }
}

describe('terrain tiles', () => {
  it('preserves all triangles including partial edge tiles and gives each tile local bounds', () => {
    const tiles = terrainGeometries(map(130, 98))
    try {
      expect(tiles).toHaveLength(6)
      expect(tiles.reduce((sum, t) => sum + t.index!.count / 3, 0)).toBe(129 * 97 * 2)
      const min = new Vector3(Infinity, Infinity, Infinity)
      const max = new Vector3(-Infinity, -Infinity, -Infinity)
      for (const t of tiles) {
        min.min(t.boundingBox!.min)
        max.max(t.boundingBox!.max)
        expect(t.boundingBox!.max.x - t.boundingBox!.min.x).toBeLessThanOrEqual(384)
        expect(t.boundingBox!.max.z - t.boundingBox!.min.z).toBeLessThanOrEqual(384)
        for (const a of Object.values(t.attributes))
          expect(Array.from(a.array).every(Number.isFinite)).toBe(true)
        expect(Array.from(t.index!.array).every((i) => i < t.getAttribute('position').count)).toBe(
          true,
        )
      }
      expect([min.x, min.z, max.x, max.z]).toEqual([0, 0, 774, 582])
    } finally {
      tiles.forEach((t) => t.dispose())
    }
  })

  it('keeps shared edge positions and normals identical, including a four-tile corner', () => {
    const tiles = terrainGeometries(map(129, 129))
    try {
      const samples: number[][] = []
      for (const t of tiles) {
        const p = t.getAttribute('position'),
          n = t.getAttribute('normal')
        for (let i = 0; i < p.count; i++)
          if (p.getX(i) === 384 && p.getZ(i) === 384)
            samples.push([p.getY(i), n.getX(i), n.getY(i), n.getZ(i)])
      }
      expect(samples).toHaveLength(4)
      expect(samples.every((s) => s.every((v, i) => v === samples[0]![i]))).toBe(true)
      expect(samples[0]![2]).toBeGreaterThan(0.9)
    } finally {
      tiles.forEach((t) => t.dispose())
    }
  })
})
