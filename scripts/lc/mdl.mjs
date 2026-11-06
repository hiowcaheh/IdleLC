/**
 * Reader of the client's legacy vertex-animated models (.mdl, "MDAT" V002–V010), after
 * CModelData::Read_t (Engine/Models/Model.cpp). The effects (EFMD) use a handful of them: planes,
 * flat rings, cylinders and the hurricane funnels. Only what drawing needs is kept: the first mip's
 * polygons and texture vertices, every frame's vertices, the surfaces (translucency, sides, colour)
 * and the animations.
 *
 * Positions: (compressed point − md_vCompressedCenter) × md_Stretch (RenderModel.cpp), where
 * md_vCompressedCenter = −md_vCenter / md_Stretch. Texture vertices are in mex: the renderer divides
 * them by the texture's mex size (RenderModel_View.cpp fTexCorrU / fTexCorrV).
 */
import { Reader } from './binary.mjs'

const VERSIONS = ['V002', 'V003', 'V004', 'V005', 'V006', 'V007', 'V008', 'V009', 'V010']
const MAX_MODELMIPS = 32
const MAX_TEXTUREPATCHES = 32
export const MF_FACE_FORWARD = 1 << 0
export const MF_HALF_FACE_FORWARD = 1 << 3
const MF_COMPRESSED_16BIT = 1 << 4
/** Model_internal.h SurfaceTranslucencyType. */
export const STT = {
  OPAQUE: 0,
  TRANSLUCENT: 1,
  ALPHAGOURAUD: 2,
  ADD: 3,
  TRANSPARENT: 4,
  INVMULTIPLY: 5,
}
const SRF_DOUBLESIDED = 1 << 0

/** ReadFullChunk_t: id, size, then exactly that many bytes. */
function fullChunk(r, id, size) {
  const found = r.id()
  if (found !== id) throw new Error(`expected ${id}, found ${found} at ${r.o - 4}`)
  const n = r.u32()
  if (n !== size) throw new Error(`${id}: size ${n}, expected ${size}`)
  return r.o
}

function expect(r, id) {
  const found = r.id()
  if (found !== id) throw new Error(`expected ${id}, found ${found} at ${r.o - 4}`)
}

const peek = (r) => new TextDecoder('latin1').decode(r.buf.subarray(r.o, r.o + 4))

/** A CTFileName: a string, or "DFNM" and its index in the file's name dictionary. */
function fileName(r) {
  if (peek(r) === 'DFNM') {
    r.id()
    return r.i32()
  }
  return r.string()
}

function readMip(r, { patches, perSurface, surfaceColors }) {
  const polygonCount = (fullChunk(r, 'IPOL', 4), r.i32())
  const polygons = []
  for (let p = 0; p < polygonCount; p++) {
    let count
    let legacy = false
    if (peek(r) === 'MDPL') {
      expect(r, 'MDPL')
      fullChunk(r, 'IMPV', 4)
      count = r.i32()
      legacy = true
    } else {
      expect(r, 'MDP2')
      count = r.i32()
    }
    const vertices = []
    for (let v = 0; v < count; v++) vertices.push({ vertex: r.i32(), texture: r.i32() })
    const renderFlags = r.u32()
    const color = r.u32()
    const surface = r.i32()
    if (legacy) r.bytes(8) // ex on / off colours
    polygons.push({ vertices, renderFlags, color, surface })
  }
  const textureCount = r.i32()
  const textureVertices = []
  if (perSurface) {
    const id = r.id()
    r.u32() // chunk size
    for (let i = 0; i < textureCount; i++) {
      r.bytes(12) // mtv_UVW
      const u = r.i32()
      const v = r.i32()
      r.bytes(8) // done / surface vertex, transformed vertex
      if (id === 'TXV2') r.bytes(24) // bump directions
      textureVertices.push([u, v])
    }
  } else {
    expect(r, 'TXVT')
    r.u32()
    for (let i = 0; i < textureCount; i++) {
      r.bytes(12)
      textureVertices.push([r.i32(), r.i32()])
      r.bytes(4)
    }
  }
  const surfaceCount = r.i32()
  const surfaces = []
  for (let s = 0; s < surfaceCount; s++) {
    const name = r.string()
    r.bytes(12 + 12 + 4) // 2D offset, HPB, zoom
    const surface = { name, translucency: STT.OPAQUE, flags: 0, color: 0xffffffff }
    if (perSurface) {
      r.u32() // shading
      surface.translucency = r.u32()
      surface.flags = r.u32()
      const polygonIds = r.i32()
      r.bytes(polygonIds * 4)
      const textureIds = r.i32()
      r.bytes(textureIds * 4)
      surface.color = r.u32()
    } else {
      // older files: the colour of the first polygon of the surface
      surface.color = polygons.find((p) => p.surface === s)?.color ?? 0xffffffff
    }
    if (surfaceColors) r.bytes(6 * 4)
    surfaces.push(surface)
  }
  if (patches) {
    r.u32() // mip flags
    const patchCount = r.i32()
    for (let p = 0; p < patchCount; p++) {
      const occupied = r.i32()
      if (occupied !== 0) {
        fullChunk(r, 'OCPL', occupied * 4)
        r.bytes(occupied * 4)
      }
    }
  }
  return { polygons, textureVertices, surfaces }
}

/** Parses an .mdl file. */
export function parseMdl(buffer) {
  const r = new Reader(buffer)
  expect(r, 'MDAT')
  const version = r.id()
  const level = VERSIONS.indexOf(version)
  if (level < 0) throw new Error(`unknown model version ${version}`)
  const savedCenter = level >= 1
  const collisionBoxes = level >= 2
  const attached = level >= 3
  const patches = level >= 4
  const perSurface = level >= 5
  const flagsOnStart = level >= 6
  const surfaceColors = level >= 8
  let flags = flagsOnStart ? r.u32() : 0

  const vertexCount = (fullChunk(r, 'IVTX', 4), r.i32())
  const frameCount = (fullChunk(r, 'IFRM', 4), r.i32())
  if (vertexCount < 0 || frameCount < 0 || vertexCount * frameCount > 4_000_000)
    throw new Error('model too large')
  // compressed points of every frame, read once flags are known (V002–V006 keep flags at the end)
  let pointsAt = r.o
  let packed16 = null
  const chunk = peek(r)
  if (chunk === 'AV17' || chunk === 'AV16') {
    packed16 = chunk
    r.id()
    r.bytes(r.u32())
  } else {
    fullChunk(r, 'AFVX', vertexCount * frameCount * 4)
    r.bytes(vertexCount * frameCount * 4)
  }
  pointsAt += 8
  fullChunk(r, 'AFIN', frameCount * 24)
  r.bytes(frameCount * 24)
  fullChunk(r, 'AMMV', vertexCount * 12)
  r.bytes(vertexCount * 12)
  fullChunk(r, 'AVMK', vertexCount * 4)
  r.bytes(vertexCount * 4)
  const mipCount = (fullChunk(r, 'IMIP', 4), r.i32())
  fullChunk(r, 'FMIP', MAX_MODELMIPS * 4)
  r.bytes(MAX_MODELMIPS * 4)
  const mips = []
  for (let i = 0; i < mipCount; i++) mips.push(readMip(r, { patches, perSurface, surfaceColors }))

  const patchChunk = peek(r)
  if (patchChunk === 'STMK') {
    fullChunk(r, 'STMK', 4)
    const existing = r.u32()
    for (let p = 0; p < MAX_TEXTUREPATCHES; p++) if (existing & (1 << p)) fileName(r)
  } else if (patchChunk === 'PTC2') {
    expect(r, 'PTC2')
    for (let p = 0; p < MAX_TEXTUREPATCHES; p++) {
      r.string() // name
      fileName(r) // texture
      r.bytes(8 + 4) // position, stretch
    }
  } else throw new Error(`expected patch data, found ${patchChunk}`)
  const width = (fullChunk(r, 'STXW', 4), r.i32())
  const height = (fullChunk(r, 'STXH', 4), r.i32())
  if (patchChunk === 'STMK') {
    expect(r, 'POSS')
    r.u32()
    r.bytes(MAX_TEXTUREPATCHES * 8)
  }
  if (!flagsOnStart) flags = r.u32()
  r.i32() // shadow quality
  const stretch = [r.f32(), r.f32(), r.f32()]
  const center = savedCenter ? [r.f32(), r.f32(), r.f32()] : [0, 0, 0]
  const boxes = collisionBoxes ? r.i32() : 1
  for (let b = 0; b < boxes; b++) {
    r.bytes(24)
    if (collisionBoxes) r.string()
  }
  if (peek(r) === 'COLI') {
    r.id()
    r.u32()
  }
  if (attached) {
    const count = r.i32()
    r.bytes(count * (12 + 24))
  }
  const colorNames = (fullChunk(r, 'ICLN', 4), r.i32())
  for (let i = 0; i < colorNames; i++) {
    r.i32()
    r.string()
  }
  expect(r, 'ADAT')
  const animCount = r.i32()
  const anims = []
  for (let a = 0; a < animCount; a++) {
    const name = new TextDecoder('latin1').decode(r.bytes(32)).replace(/\0.*$/s, '')
    const secsPerFrame = r.f32()
    const frames = r.i32()
    const indices = []
    for (let f = 0; f < frames; f++) indices.push(r.i32())
    anims.push({ name, secsPerFrame, frames: indices })
  }

  // decompress every frame's points (16-bit: SWORD x, y, z + 2 normal bytes; 8-bit: SBYTE x, y, z + 1)
  const compressed16 = (flags & MF_COMPRESSED_16BIT) !== 0 && packed16 !== null
  // sizeof(ModelFrameVertex16) and the padded ModelFrameVertex16_old are both 8
  const stride = compressed16 ? 8 : 4
  const offset = center.map((c, i) => -c / stretch[i])
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const frames = []
  for (let f = 0; f < frameCount; f++) {
    const points = new Float32Array(vertexCount * 3)
    for (let v = 0; v < vertexCount; v++) {
      const at = pointsAt + (f * vertexCount + v) * stride
      for (let k = 0; k < 3; k++) {
        const raw = compressed16 ? view.getInt16(at + k * 2, true) : view.getInt8(at + k)
        points[v * 3 + k] = (raw - offset[k]) * stretch[k]
      }
    }
    frames.push(points)
  }
  return {
    version,
    flags,
    faceForward: flags & MF_HALF_FACE_FORWARD ? 2 : flags & MF_FACE_FORWARD ? 1 : 0,
    vertexCount,
    frames,
    mip: mips[0] ?? { polygons: [], textureVertices: [], surfaces: [] },
    mexWidth: width,
    mexHeight: height,
    anims,
    doubleSided: (surface) => (surface.flags & SRF_DOUBLESIDED) !== 0,
  }
}

/**
 * The first mip as triangles per surface: each (vertex, texture vertex) pair once, its position in
 * every frame, its mex coordinates, and the surfaces' draw state.
 */
export function mdlMesh(model) {
  const { polygons, textureVertices, surfaces } = model.mip
  const corner = new Map()
  const vertexOf = []
  const uv = []
  const pairIndex = (vertex, texture) => {
    const key = `${vertex}/${texture}`
    let index = corner.get(key)
    if (index === undefined) {
      index = vertexOf.length
      corner.set(key, index)
      vertexOf.push(vertex)
      const [u, v] = textureVertices[texture] ?? [0, 0]
      uv.push(u, v)
    }
    return index
  }
  const groups = surfaces.map((surface) => ({
    translucency: surface.translucency,
    doubleSided: model.doubleSided(surface),
    color: surface.color >>> 0,
    index: [],
  }))
  for (const polygon of polygons) {
    const group = groups[polygon.surface]
    if (!group || polygon.vertices.length < 3) continue
    const ids = polygon.vertices.map((c) => pairIndex(c.vertex, c.texture))
    // a convex fan, in the file's winding
    for (let i = 1; i + 1 < ids.length; i++) group.index.push(ids[0], ids[i], ids[i + 1])
  }
  const frames = model.frames.map((points) =>
    vertexOf.flatMap((v) => [points[v * 3], points[v * 3 + 1], points[v * 3 + 2]]),
  )
  return { frames, uv, surfaces: groups.filter((g) => g.index.length) }
}
