/**
 * Builders for synthetic LC files used by the converter tests (no client assets in the repo).
 * They write the same layouts the readers expect — see docs/lc-formats.md.
 */
import { MESH_KEY, TEXTURE_KEY } from './binary.mjs'

export class Writer {
  constructor(key = null) {
    this.chunks = []
    this.key = key ? { bytes: Uint8Array.from(key.bytes), step: key.step } : null
  }

  #push(size, write) {
    const b = Buffer.alloc(size)
    write(b)
    this.chunks.push(b)
    return this
  }

  u8(v) {
    return this.#push(1, (b) => b.writeUInt8(v))
  }

  u16(v) {
    return this.#push(2, (b) => b.writeUInt16LE(v))
  }

  u32(v) {
    return this.#push(4, (b) => b.writeUInt32LE(v >>> 0))
  }

  f32(v) {
    return this.#push(4, (b) => b.writeFloatLE(v))
  }

  floats(values) {
    for (const v of values) this.f32(v)
    return this
  }

  bytes(values) {
    this.chunks.push(Buffer.from(values))
    return this
  }

  id(text) {
    this.chunks.push(Buffer.from(text, 'latin1'))
    return this
  }

  string(text) {
    return this.u32(text.length).id(text)
  }

  xint(v) {
    const k = this.key.bytes
    const keyValue = (k[0] | (k[1] << 8) | (k[2] << 16) | (k[3] << 24)) >>> 0
    for (let i = 0; i < 4; i++) k[i] = (k[i] + this.key.step) & 0xff
    return this.u32((v ^ keyValue) >>> 0)
  }

  toBuffer() {
    return Buffer.concat(this.chunks)
  }
}

/**
 * MESH v17 with one LOD. Surfaces: { first, indices (relative to first), name, shader?, textures?,
 * colors?, flags? }; weightMaps: { bone, pairs: [[vertex, weight]] }.
 */
export function meshFile({ positions, normals, uvs = null, surfaces, weightMaps = [] }) {
  const ctVx = positions.length / 3
  const w = new Writer(MESH_KEY).id('MESH').u32(17).u32(0)
  w.xint(1) // LODs
  w.xint(ctVx)
    .xint(weightMaps.length)
    .xint(uvs ? 1 : 0)
    .xint(ctVx)
    .xint(surfaces.length)
    .xint(0)
  w.string('test.gr').f32(-1).xint(0)
  w.floats(positions).floats(normals)
  if (uvs) w.string('Texture').floats(uvs)
  for (const s of surfaces) {
    w.xint(s.first)
      .xint(s.count ?? ctVx)
      .xint(s.indices.length / 3)
    for (const i of s.indices) w.u16(i)
    w.string(s.name).xint(0).xint(0) // unknown, empty bone palette
    w.xint(s.shader ? 1 : 0)
    if (s.shader) {
      const textures = s.textures ?? []
      const colors = s.colors ?? []
      w.xint(1).xint(colors.length).xint(textures.length).xint(0)
      w.string(s.shader)
      for (const t of textures) w.string(t)
      w.xint(0) // texcoord set
      for (const c of colors) w.xint(c)
      w.xint(s.flags ?? 0)
    }
  }
  for (const map of weightMaps) {
    w.string(map.bone).xint(map.pairs.length)
    for (const [vertex, weight] of map.pairs) w.u32(vertex).f32(weight)
  }
  w.bytes(new Array(ctVx * 8).fill(0))
  return w.toBuffer()
}

/** SKEL v6, bones: { name, parent, abs (12), pos (3), rot (w, x, y, z) }. */
export function skeletonFile(bones) {
  const w = new Writer().id('SKEL').u32(6).u32(1).string('test.as').f32(-1).u32(bones.length)
  for (const b of bones) {
    w.string(b.name)
      .string(b.parent ?? '')
      .floats(b.abs)
      .floats(b.pos)
      .floats(b.rot)
      .f32(0)
      .f32(1)
  }
  return w.toBuffer()
}

/** ANIM v14, anims: { name, secondsPerFrame, frames, bones: [{ bone, positions, rotations }] }. */
export function animSetFile(anims) {
  const w = new Writer().id('ANIM').u32(14).u32(anims.length)
  for (const a of anims) {
    w.string('test.aa').string(a.name).f32(a.secondsPerFrame).u32(a.frames).f32(0).u32(0).u32(0)
    w.u32(a.bones.length)
    for (const b of a.bones) {
      w.string(b.bone).floats(new Array(12).fill(0))
      w.u32(b.positions.length)
      for (const k of b.positions) w.u16(k.frame).u16(0).floats(k.value)
      w.u32(b.rotations.length)
      for (const k of b.rotations) w.u16(k.frame).u16(0).floats(k.value)
      w.f32(0)
    }
    w.u32(0) // morph envelopes
  }
  return w.toBuffer()
}

/** LC texture header (TVER + encrypted TDAT) followed by `frameChunk`. */
export function textureFile({ width, height, flags = 0, frames = 1, mips = 1 }, frameChunk) {
  const w = new Writer(TEXTURE_KEY).id('TVER').u16(4).u16(1).id('TDAT')
  w.xint(width).xint(0).xint(height).xint(mips).xint(flags).xint(frames)
  return Buffer.concat([w.toBuffer(), frameChunk])
}

/** FRMC chunk from DXT mip data (array of byte arrays). */
export function frmcChunk(mips) {
  const w = new Writer().id('FRMC')
  w.u32(mips.reduce((s, m) => s + 4 + m.length, 0))
  for (const m of mips) w.u32(m.length).bytes(m)
  return w.toBuffer()
}
