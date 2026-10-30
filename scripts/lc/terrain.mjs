/**
 * Open-world terrain of a map (`.wtr`, Serious Engine terrain archive `TRAR`): the height map and
 * the texture layers with their masks. The game draws the terrain around a hunting spot from what
 * `buildTerrain` writes to public/maps/<map>/ (see docs/lc-formats.md, "Teren .wtr").
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

const tag = (buf, at) => buf.toString('latin1', at, at + 4)
const MASK_SIDES = [256, 512, 1024, 2048]
/** A layer stretch that can be read (a few layers store their block one byte off): else 1.5. */
const sane = (repeat) => (repeat >= 0.1 && repeat <= 16 ? repeat : 1.5)

/**
 * The terrain: size in vertices, metres per cell (x, z), metres per height unit, heights (u16, row by
 * row along z), layers in drawing order (texture path, texture repeat in cells, mask: size × size
 * bytes, 255 = this layer on top).
 */
export function parseTerrain(buf) {
  if (tag(buf, 0) !== 'TRAR') throw new Error('not a terrain archive (TRAR)')
  const grid = buf.indexOf('TRGD', 0, 'latin1')
  const width = buf.readUInt32LE(grid + 4)
  const height = buf.readUInt32LE(grid + 8)
  const heightsAt = buf.indexOf('TRHM', grid, 'latin1')
  if (heightsAt < 0) throw new Error('terrain without a height map (TRHM)')
  // the seven floats before TRHM: distance factor, stretch x / height / z, size x / height / z
  const cellX = buf.readFloatLE(heightsAt - 24)
  const heightScale = buf.readFloatLE(heightsAt - 20)
  const cellZ = buf.readFloatLE(heightsAt - 16)
  const heights = new Uint16Array(width * height)
  for (let i = 0; i < heights.length; i++) heights[i] = buf.readUInt16LE(heightsAt + 4 + i * 2)

  // layers: TRLT, DFNM <texture>, TRLV <version>, TRLG <148 bytes>, TRLM <mask>
  const layers = []
  let at = buf.indexOf('TRLT', heightsAt, 'latin1')
  while (at >= 0 && tag(buf, at) === 'TRLT' && tag(buf, at + 4) === 'DFNM') {
    const nameLength = buf.readUInt32LE(at + 8)
    const texture = buf.toString('latin1', at + 12, at + 12 + nameLength)
    let p = at + 12 + nameLength
    if (tag(buf, p) !== 'TRLV' || tag(buf, p + 8) !== 'TRLG') break
    const params = p + 12
    const maskAt = buf.indexOf('TRLM', params, 'latin1')
    // a square mask (256…2048 a side) followed by the next file name (DFNM) or the end (TRDE)
    const size = MASK_SIDES.find((side) =>
      ['DFNM', 'TRDE'].includes(tag(buf, maskAt + 4 + side * side)),
    )
    if (!size) throw new Error(`layer ${layers.length}: mask size not found`)
    layers.push({
      texture,
      // layer stretch (TRLG float 11): the texture repeats every `repeat` cells
      repeat: sane(buf.readFloatLE(params + 11 * 4)),
      mask: { size, data: buf.subarray(maskAt + 4, maskAt + 4 + size * size) },
    })
    at = buf.indexOf('TRLT', maskAt + 4 + size * size, 'latin1')
  }
  return { width, height, cellX, cellZ, heightScale, heights, layers }
}

/** Longest side of a layer texture (they repeat many times, so smaller is fine). */
const LAYER_TEXTURE = 256
/** Side of the mask sheets (four layer masks per RGBA sheet). */
const MASK_SIZE = 512

/** Terrain height in metres at a point (bilinear between the height map's vertices). */
export function heightAt(terrain, x, z) {
  const fx = Math.min(terrain.width - 1.001, Math.max(0, x / terrain.cellX))
  const fz = Math.min(terrain.height - 1.001, Math.max(0, z / terrain.cellZ))
  const i = Math.floor(fx)
  const j = Math.floor(fz)
  const h = (a, b) => terrain.heights[b * terrain.width + a] * terrain.heightScale
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * (fx - i)
  const bottom = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * (fx - i)
  return top + (bottom - top) * (fz - j)
}

/** How much of a layer covers a point (0…1). */
function coverage(layer, size, x, z) {
  const { size: side, data } = layer.mask
  const i = Math.min(side - 1, Math.floor((x / size) * side))
  const j = Math.min(side - 1, Math.floor((z / size) * side))
  return data[j * side + i] / 255
}

/** Arena radius: the fight needs fairly level, dry ground this far around its centre. */
const ARENA_RADIUS = 12
/** Steepest rise allowed inside an arena (metres). */
const ARENA_RISE = 1.6
/** Fewest metres between two arenas. */
const ARENA_SPACING = 70

/**
 * Hunting grounds when the database's spawn points don't fit the map: level, dry ground away from
 * the map's edge and its town, nearest the town first (where the weakest monsters live).
 * `options`: town [x, z] and its radius, layers that are water or road.
 */
export function pickArenas(terrain, options) {
  const size = (terrain.width - 1) * terrain.cellX
  const margin = 160
  const [tx, tz] = options.town
  const candidates = []
  for (let x = margin; x <= size - margin; x += 12) {
    for (let z = margin; z <= size - margin; z += 12) {
      if (Math.hypot(x - tx, z - tz) < options.townRadius) continue
      const centre = heightAt(terrain, x, z)
      let rise = 0
      let wet = 0
      for (let a = 0; a < 16; a++) {
        for (const r of [ARENA_RADIUS / 2, ARENA_RADIUS]) {
          const px = x + Math.cos((a / 16) * Math.PI * 2) * r
          const pz = z + Math.sin((a / 16) * Math.PI * 2) * r
          rise = Math.max(rise, Math.abs(heightAt(terrain, px, pz) - centre))
          for (const k of options.avoidLayers)
            wet = Math.max(wet, coverage(terrain.layers[k], size, px, pz))
        }
      }
      if (rise <= ARENA_RISE && wet < 0.3) candidates.push([x, z, Math.hypot(x - tx, z - tz)])
    }
  }
  candidates.sort((a, b) => a[2] - b[2])
  const arenas = []
  for (const [x, z] of candidates) {
    if (arenas.every(([ax, az]) => Math.hypot(ax - x, az - z) >= ARENA_SPACING)) arenas.push([x, z])
  }
  return arenas
}

/**
 * Files of one map for public/maps/<map>/: terrain.json, heights.bin, layer-<n>.webp,
 * masks-<n>.webp. `files` reads client paths; `arenas` options as in pickArenas.
 */
export async function buildTerrain(files, wtrPath, arenaOptions) {
  const terrain = parseTerrain(files.read(wtrPath))
  const out = {}
  const layers = []
  for (const [i, layer] of terrain.layers.entries()) {
    const tex = parseTexture(files.read(layer.texture))
    out[`layer-${i}.webp`] = await sharp(tex.rgba, {
      raw: { width: tex.width, height: tex.height, channels: 4 },
    })
      .removeAlpha()
      .resize(LAYER_TEXTURE, LAYER_TEXTURE)
      .webp({ quality: 82 })
      .toBuffer()
    layers.push({ texture: `layer-${i}.webp`, tile: layer.repeat * terrain.cellX })
  }
  // masks of layers 1… (layer 0 is the base) packed four to a sheet, R G B A
  const masks = []
  for (let first = 1; first < terrain.layers.length; first += 4) {
    const sheet = Buffer.alloc(MASK_SIZE * MASK_SIZE * 4)
    for (let k = 0; k < 4; k++) {
      const layer = terrain.layers[first + k]
      if (!layer) continue
      const { size, data } = layer.mask
      const scaled = await sharp(data, { raw: { width: size, height: size, channels: 1 } })
        .resize(MASK_SIZE, MASK_SIZE)
        .raw()
        .toBuffer()
      for (let i = 0; i < MASK_SIZE * MASK_SIZE; i++) sheet[i * 4 + k] = scaled[i]
    }
    const name = `masks-${masks.length}.webp`
    out[name] = await sharp(sheet, { raw: { width: MASK_SIZE, height: MASK_SIZE, channels: 4 } })
      .webp({ lossless: true })
      .toBuffer()
    masks.push(name)
  }
  out['heights.bin'] = Buffer.from(terrain.heights.buffer)
  out['terrain.json'] = Buffer.from(
    JSON.stringify(
      {
        width: terrain.width,
        height: terrain.height,
        cell: terrain.cellX,
        heightScale: terrain.heightScale,
        layers,
        masks,
        arenas: pickArenas(terrain, arenaOptions),
      },
      null,
      2,
    ),
  )
  return out
}
