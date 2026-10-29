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
  for (let l = 0; l < ctLods; l++) {
    const [ctVx, ctWm, ctUv, ctVx2, ctSf, ctMm] = [
      r.xint(),
      r.xint(),
      r.xint(),
      r.xint(),
      r.xint(),
      r.xint(),
    ]
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
      const local = r.u16s(ctTris * 3)
      // triangle indices are stored relative to the surface's first vertex
      const indices = new Uint32Array(local.length)
      for (let k = 0; k < local.length; k++) indices[k] = local[k] + first
      const surface = { first, count, indices, name: r.string() }
      r.xint() // unknown (0/1)
      surface.bonePalette = Array.from(r.bytes(r.xint()))
      if (r.xint()) {
        const ctTexCoords = r.xint()
        const ctColors = r.xint()
        const ctTextures = r.xint()
        const ctFloats = r.xint()
        surface.shader = r.string()
        surface.textures = Array.from({ length: ctTextures }, () => r.string())
        surface.texCoords = Array.from({ length: ctTexCoords }, () => r.xint())
        surface.colors = Array.from({ length: ctColors }, () => r.xint())
        surface.floats = Array.from(r.floats(ctFloats))
        surface.shaderFlags = r.xint()
      }
      lod.surfaces.push(surface)
    }
    lod.weightMaps = []
    for (let i = 0; i < ctWm; i++) {
      const bone = r.string()
      const n = r.xint()
      const vertices = new Uint32Array(n)
      const weights = new Float32Array(n)
      for (let k = 0; k < n; k++) {
        vertices[k] = r.u32()
        weights[k] = r.f32()
      }
      lod.weightMaps.push({ bone, vertices, weights })
    }
    if (ctMm !== 0) throw new Error('morph maps are not supported yet')
    r.bytes(ctVx * 8) // GPU skinning data (palette indices + byte weights) — weight maps are used instead
    lods.push(lod)
  }
  return { lods, end: r.o }
}
