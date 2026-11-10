import { describe, expect, it } from 'vitest'
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Sphere, Vector3 } from 'three'
import {
  PropGrid,
  selectProps,
  writePropInstances,
  type PropLocation,
} from './mapPropVisibility.ts'
import { CAMERA_OFFSET } from './viewState.ts'

const point = (id: number, x: number, z: number, radius = 0, model = 0): PropLocation => ({
  id,
  x,
  z,
  radius,
  model,
})

describe('map prop selection', () => {
  it('extends only the tall-prop corridor for a distant boss camera and preserves grass', () => {
    const to = new Vector3(CAMERA_OFFSET.x, 0, CAMERA_OFFSET.z).normalize()
    const points = [
      point(0, to.x * 65, to.z * 65, 3),
      point(1, to.x * 65, to.z * 65, 0),
      point(2, -to.x * 65, -to.z * 65, 3),
    ]
    const shown: PropLocation[][] = [[]]
    const grid = new PropGrid(points)
    selectProps(grid, 0, 0, shown)
    expect(shown[0]!.map((p) => p.id)).toEqual([0, 1, 2])
    selectProps(grid, 0, 0, shown, 85)
    expect(shown[0]!.map((p) => p.id)).toEqual([1, 2])
  })
  it('includes the radius boundary and handles negative cell coordinates', () => {
    const points = [
      point(0, 0, 0),
      point(1, -120, 0),
      point(2, 120, 0),
      point(3, 0, -120),
      point(4, 0, 120),
      point(5, -120.001, 0),
      point(6, 120.001, 0),
      point(7, -100, -100),
    ]
    const found: number[] = []
    new PropGrid(points).forEachNear(0, 0, 120, (p) => found.push(p.id))
    expect(found.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('keeps grass in the camera corridor and hides only the tall obstructing props', () => {
    const to = new Vector3(CAMERA_OFFSET.x, 0, CAMERA_OFFSET.z).normalize()
    const points = [
      point(0, to.x * 8, to.z * 8, 2),
      point(1, to.x * 8, to.z * 8),
      point(2, to.x * 8 + to.z * 6, to.z * 8 - to.x * 6, 2),
      point(3, -to.x * 20, -to.z * 20, 1),
    ]
    const shown: PropLocation[][] = [[]]
    selectProps(new PropGrid(points), 0, 0, shown)
    expect(shown[0]!.map((p) => p.id)).toEqual([1, 2, 3])
  })

  it('reuses the lists and preserves placement order across cell boundaries', () => {
    const points = [
      point(0, 64.1, 0),
      point(1, -63.9, 0),
      point(2, 0, 0, 0, 1),
      point(3, -64.1, 0),
      point(4, 63.9, 0),
    ]
    const grid = new PropGrid(points)
    const shown: PropLocation[][] = [[], []]
    const list = shown[0]
    for (const x of [-2, 2]) {
      selectProps(grid, x, 0, shown)
      expect(shown[0]).toBe(list)
      expect(shown.map((l) => l.map((p) => p.id))).toEqual([[0, 1, 3, 4], [2]])
    }
    selectProps(grid, 1000, 1000, shown)
    expect(shown).toEqual([[], []])
  })

  it('matches the previous full-map visibility rules along a path', () => {
    const points = Array.from({ length: 1600 }, (_, i) =>
      point(
        i,
        ((i * 137) % 2000) - 1000,
        ((i * 329) % 1800) - 900,
        i % 3 ? 1 + (i % 10) : 0,
        i % 4,
      ),
    )
    const grid = new PropGrid(points)
    const shown: PropLocation[][] = [[], [], [], []]
    const to = new Vector3(CAMERA_OFFSET.x, 0, CAMERA_OFFSET.z).normalize()
    for (let step = 0; step < 80; step++) {
      const x = -850 + step * 23.7
      const z = -700 + step * 18.9
      // Reference: the full scan used before the spatial index and partial uploads.
      const expected = points.filter((p) => {
        const dx = p.x - x
        const dz = p.z - z
        if (dx * dx + dz * dz > 120 * 120) return false
        if (p.radius === 0) return true
        const along = Math.max(-6, Math.min(26, dx * to.x + dz * to.z))
        return Math.hypot(dx - to.x * along, dz - to.z * along) >= p.radius + 3
      })
      selectProps(grid, x, z, shown)
      for (let model = 0; model < 4; model++)
        expect(shown[model]).toEqual(expected.filter((p) => p.model === model))
    }
  })

  it('examines nearby cells rather than every placement on a dense map', () => {
    const points = Array.from({ length: 10000 }, (_, i) =>
      point(i, (i % 100) * 20 - 1000, Math.floor(i / 100) * 20 - 1000),
    )
    const found: PropLocation[] = []
    const examined = new PropGrid(points).forEachNear(10, -10, 120, (p) => found.push(p))
    expect(examined).toBeLessThan(points.length / 10)
    expect(found.sort((a, b) => a.id - b.id)).toEqual(
      points.filter((p) => (p.x - 10) ** 2 + (p.z + 10) ** 2 <= 120 ** 2),
    )
  })
})

describe('map prop instance buffers', () => {
  it('updates only the drawn prefix when shrinking, clearing and growing again', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshBasicMaterial()
    const mesh = new InstancedMesh(geometry, material, 20)
    const selected = [3, 6, 9].map((x) => ({ matrix: new Matrix4().makeTranslation(x, 2, -4) }))
    const bounds = new Sphere(new Vector3(6, 2, -4), 5)
    try {
      writePropInstances(mesh, selected, bounds)
      expect(mesh.count).toBe(3)
      expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 48 }])
      expect(mesh.boundingSphere).toEqual(bounds)
      expect(mesh.boundingSphere).not.toBe(bounds)
      const matrix = new Matrix4()
      mesh.getMatrixAt(2, matrix)
      expect(matrix).toEqual(selected[2]!.matrix)

      // An offscreen mesh may still have a pending update when its selection changes again.
      mesh.instanceMatrix.addUpdateRange(48, 16)
      writePropInstances(mesh, selected.slice(0, 1), bounds)
      expect(mesh.count).toBe(1)
      expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }])
      const version = mesh.instanceMatrix.version
      writePropInstances(mesh, [], new Sphere().makeEmpty())
      expect(mesh.count).toBe(0)
      expect(mesh.boundingSphere!.isEmpty()).toBe(true)
      expect(mesh.instanceMatrix.version).toBe(version)

      writePropInstances(mesh, selected, bounds)
      expect(mesh.count).toBe(3)
      expect(mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 48 }])
      mesh.getMatrixAt(2, matrix)
      expect(matrix).toEqual(selected[2]!.matrix)
      expect(mesh.boundingSphere!.containsPoint(new Vector3(9, 2, -4))).toBe(true)
    } finally {
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    }
  })
})
