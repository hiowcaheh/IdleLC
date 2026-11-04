import { BufferAttribute, BufferGeometry, PlaneGeometry } from 'three'
import { groundHeight, type LcMap } from './lcMap.ts'

/** Keep every height sample and shared-edge normal, while letting the camera cull distant tiles. */
export function terrainGeometries(map: LcMap, cells = 64): BufferGeometry[] {
  const { width, height, cell } = map.meta
  const whole = new PlaneGeometry((width - 1) * cell, (height - 1) * cell, width - 1, height - 1)
  whole.rotateX(-Math.PI / 2)
  whole.translate(((width - 1) * cell) / 2, 0, ((height - 1) * cell) / 2)
  const pos = whole.getAttribute('position')
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(map, pos.getX(i), pos.getZ(i)))
  // Computing normals before splitting avoids lighting seams at tile edges.
  whole.computeVertexNormals()
  const normal = whole.getAttribute('normal')
  const tiles: BufferGeometry[] = []
  for (let z = 0; z < height - 1; z += cells) {
    for (let x = 0; x < width - 1; x += cells) {
      const cols = Math.min(cells, width - 1 - x)
      const rows = Math.min(cells, height - 1 - z)
      const positions = new Float32Array((cols + 1) * (rows + 1) * 3)
      const normals = new Float32Array(positions.length)
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const source = (z + j) * width + x + i
          const target = (j * (cols + 1) + i) * 3
          positions.set([pos.getX(source), pos.getY(source), pos.getZ(source)], target)
          normals.set([normal.getX(source), normal.getY(source), normal.getZ(source)], target)
        }
      }
      const indices: number[] = []
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = j * (cols + 1) + i
          const b = a + cols + 1
          indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
      }
      const tile = new BufferGeometry()
      tile.setAttribute('position', new BufferAttribute(positions, 3))
      tile.setAttribute('normal', new BufferAttribute(normals, 3))
      tile.setIndex(indices)
      tile.computeBoundingBox()
      tile.computeBoundingSphere()
      tiles.push(tile)
    }
  }
  whole.dispose()
  return tiles
}
