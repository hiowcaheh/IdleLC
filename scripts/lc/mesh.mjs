/** LC mesh `.bm` (MESH v17) reader — see docs/lc-formats.md. */
import { MESH_KEY, Reader } from './binary.mjs'

export function parseMesh(buffer) {
  const head = new Reader(buffer)
  if (head.id() !== 'MESH') throw new Error('not a MESH file')
  const version = head.u32()
  if (version !== 17) throw new Error(`unsupported mesh version ${version}`)
  head.u32() // payload size
  const r = new Reader(buffer, head.o, MESH_KEY)
  const lods = []
  const ctLods = r.xint()
  if (ctLods > 64) throw new Error(`implausible LOD count ${ctLods}`)
  for (let l = 0; l < ctLods; l++) {
    const [ctVx, ctWm, ctUv, ctVx2, ctSf, ctMm] = [
      r.xint(),
      r.xint(),
      r.xint(),
      r.xint(),
      r.xint(),
      r.xint(),
    ]
    if (ctVx > 10000000 || ctWm > 10000 || ctUv > 32 || ctSf > 10000 || ctMm > 10000)
      throw new Error(`implausible LOD counts ${[ctVx, ctWm, ctUv, ctVx2, ctSf, ctMm]}`)
    if (ctVx !== ctVx2) throw new Error(`vertex counts differ (${ctVx} / ${ctVx2})`)
    const lod = { source: r.string(), maxDistance: r.f32(), flags: r.xint() }
    lod.positions = r.floats(ctVx * 3)
    lod.normals = r.floats(ctVx * 3)
    lod.uvMaps = []
    for (let i = 0; i < ctUv; i++) lod.uvMaps.push({ name: r.string(), uvs: r.floats(ctVx * 2) })
    lod.surfaces = []
    for (let i = 0; i < ctSf; i++) {
      const first = r.xint()
      const count = r.xint()
      const ctTris = r.xint()
      if (first + count > ctVx || ctTris * 6 > r.remaining)
        throw new Error(`surface out of bounds ${[first, count, ctTris]}`)
      const local = r.u16s(ctTris * 3)
      // triangle indices are stored relative to the surface's first vertex
      const indices = new Uint32Array(local.length)
      for (let k = 0; k < local.length; k++) {
        if (local[k] >= count)
          throw new Error(`triangle index ${local[k]} outside surface ${count}`)
        indices[k] = local[k] + first
      }
      const surface = { first, count, indices, name: r.string() }
      r.xint() // unknown (0/1)
      surface.bonePalette = Array.from(r.bytes(r.xint()))
      if (r.xint()) {
        // CMesh::Read_t_new (Engine/Ska/Mesh.cpp): colors, floats, textures, UV sets.
        const ctColors = r.xint()
        const ctFloats = r.xint()
        const ctTextures = r.xint()
        const ctTexCoords = r.xint()
        if (ctTexCoords > 32 || ctColors > 32 || ctTextures > 32 || ctFloats > 32)
          throw new Error(
            `implausible shader counts ${[ctTexCoords, ctColors, ctTextures, ctFloats]}`,
          )
        surface.shader = r.string()
        surface.textures = Array.from({ length: ctTextures }, () => r.string())
        surface.shaderFlags = r.xint()
        surface.colors = Array.from({ length: ctColors }, () => r.xint())
        surface.floats = Array.from(r.floats(ctFloats))
        surface.texCoords = Array.from({ length: ctTexCoords }, () => r.xint())
      }
      lod.surfaces.push(surface)
    }
    lod.weightMaps = []
    for (let i = 0; i < ctWm; i++) {
      const bone = r.string()
      const n = r.xint()
      if (n > ctVx * 4 || n * 8 > r.remaining)
        throw new Error(`implausible weight count ${n} for ${ctVx} at ${r.o - 4}`)
      const vertices = new Uint32Array(n)
      const weights = new Float32Array(n)
      for (let k = 0; k < n; k++) {
        vertices[k] = r.u32()
        weights[k] = r.f32()
        if (vertices[k] >= ctVx || !Number.isFinite(weights[k]) || weights[k] < 0)
          throw new Error(`invalid weight ${vertices[k]}: ${weights[k]}`)
      }
      lod.weightMaps.push({ bone, vertices, weights })
    }
    if (ctMm !== 0) throw new Error('morph maps are not supported yet')
    r.bytes(ctVx * 8) // GPU skinning data (palette indices + byte weights) — weight maps are used instead
    lods.push(lod)
  }
  return { lods, end: r.o }
}
