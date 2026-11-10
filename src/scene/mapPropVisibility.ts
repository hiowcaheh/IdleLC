import { Sphere, Vector3, type InstancedMesh, type Matrix4 } from 'three'
import { CAMERA_OFFSET } from './viewState.ts'

/** The fog and the existing camera corridor keep the same visible surroundings. */
export const PROP_VIEW_REACH = 120
const CELL_SIZE = 64
const VIEW_BEHIND = 6
const VIEW_AHEAD = 26
const VIEW_MARGIN = 3
const TO_CAMERA = new Vector3(CAMERA_OFFSET.x, 0, CAMERA_OFFSET.z).normalize()

export interface PropLocation {
  /** Stable position in the source placement list. */
  id: number
  model: number
  x: number
  z: number
  /** Ground radius of a tall prop; zero for grass and flowers. */
  radius: number
}

/** Static placements indexed once, so moving never scans the whole map. */
export class PropGrid<T extends PropLocation> {
  private readonly cells = new Map<string, T[]>()

  constructor(points: readonly T[]) {
    for (const point of points) {
      const key = this.key(Math.floor(point.x / CELL_SIZE), Math.floor(point.z / CELL_SIZE))
      let cell = this.cells.get(key)
      if (!cell) this.cells.set(key, (cell = []))
      cell.push(point)
    }
  }

  private key(x: number, z: number): string {
    return `${x}:${z}`
  }

  /** Visits the same radius as the old full scan; returns the number of candidates examined. */
  forEachNear(x: number, z: number, reach: number, visit: (point: T) => void): number {
    let examined = 0
    for (
      let j = Math.floor((z - reach) / CELL_SIZE);
      j <= Math.floor((z + reach) / CELL_SIZE);
      j++
    ) {
      for (
        let i = Math.floor((x - reach) / CELL_SIZE);
        i <= Math.floor((x + reach) / CELL_SIZE);
        i++
      ) {
        const cell = this.cells.get(this.key(i, j))
        if (!cell) continue
        for (const point of cell) {
          examined++
          const dx = point.x - x
          const dz = point.z - z
          if (dx * dx + dz * dz <= reach * reach) visit(point)
        }
      }
    }
    return examined
  }
}

/** Reuses the lists and preserves source order, including when crossing cell boundaries. */
export function selectProps<T extends PropLocation>(
  grid: PropGrid<T>,
  x: number,
  z: number,
  shown: T[][],
  cameraReach = VIEW_AHEAD,
): void {
  for (const list of shown) list.length = 0
  grid.forEachNear(x, z, PROP_VIEW_REACH, (point) => {
    if (point.radius > 0) {
      const dx = point.x - x
      const dz = point.z - z
      const along = Math.max(
        -VIEW_BEHIND,
        Math.min(cameraReach, dx * TO_CAMERA.x + dz * TO_CAMERA.z),
      )
      const off = Math.hypot(dx - TO_CAMERA.x * along, dz - TO_CAMERA.z * along)
      if (off < point.radius + VIEW_MARGIN) return
    }
    shown[point.model]!.push(point)
  })
  for (const list of shown) list.sort((a, b) => a.id - b.id)
}

/** Upload the active prefix only; stale matrices beyond count are never drawn. */
export function writePropInstances(
  mesh: InstancedMesh,
  selected: readonly { matrix: Matrix4 }[],
  bounds: Sphere,
): void {
  mesh.count = selected.length
  if (selected.length > 0) {
    for (let i = 0; i < selected.length; i++) mesh.setMatrixAt(i, selected[i]!.matrix)
    // Several selection changes can happen before an offscreen mesh is drawn again.
    // The latest prefix contains every matrix that will actually be used.
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, selected.length * 16)
    mesh.instanceMatrix.needsUpdate = true
  }
  mesh.boundingSphere ??= new Sphere()
  mesh.boundingSphere.copy(bounds)
}
