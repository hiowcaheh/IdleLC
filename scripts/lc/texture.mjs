/**
 * LC/Serious Engine texture `.tex` reader: TDAT header (encrypted in LC, plain in SE),
 * FRMS raw RGB/RGBA frames or FRMC DXT1/DXT5 mip chains. Returns the first frame / mip 0 as RGBA.
 * See docs/lc-formats.md.
 */
import { Reader, TEXTURE_KEY } from './binary.mjs'

/** TDAT: LC order mexWidth, mexShift, mexHeight, fineMips, flags, frames (encrypted). */
export function readTdat(buffer) {
  const at = buffer.indexOf('TDAT')
  if (at < 0) return null
  const lcFlag = buffer.length >= 8 ? buffer.readUInt16LE(6) : 0
  if (lcFlag === 0) {
    // plain Serious Engine v4 header: flags, mexWidth, mexHeight, fineMips, mexShift, frames
    const r = new Reader(buffer, at + 4)
    const [flags, mexW, mexH, mips, shift, frames] = [
      r.u32(),
      r.u32(),
      r.u32(),
      r.u32(),
      r.u32(),
      r.u32(),
    ]
    return { width: mexW >>> shift, height: mexH >>> shift, mips, flags, frames }
  }
  const r = new Reader(buffer, at + 4, TEXTURE_KEY)
  const [mexW, shift, mexH, mips, flags, frames] = [
    r.xint(),
    r.xint(),
    r.xint(),
    r.xint(),
    r.xint(),
    r.xint(),
  ]
  return { width: mexW >>> shift, height: mexH >>> shift, mips, flags, frames }
}

const blocks = (w, h) => Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4))

/** Finds (width, height, dxt5) whose DXT mip chain matches the stored mip sizes. */
export function dxtDims(sizes, hint = null) {
  if (hint) {
    for (const dxt5 of [false, true]) {
      if (sizes[0] === blocks(hint.width, hint.height) * (dxt5 ? 16 : 8))
        return { width: hint.width, height: hint.height, dxt5 }
    }
  }
  for (const dxt5 of [false, true]) {
    const block = dxt5 ? 16 : 8
    for (let lw = 0; lw <= 12; lw++) {
      for (let lh = 0; lh <= 12; lh++) {
        if (Math.max(lw, lh) + 1 < sizes.length) continue
        const w = 1 << lw
        const h = 1 << lh
        if (sizes.every((s, k) => s === blocks(w >> k || 1, h >> k || 1) * block))
          return { width: w, height: h, dxt5 }
      }
    }
  }
  throw new Error(`no DXT layout matches mip sizes ${sizes.slice(0, 4).join(', ')}…`)
}

function rgb565(c, out, o) {
  out[o] = (((c >> 11) & 31) * 255) / 31
  out[o + 1] = (((c >> 5) & 63) * 255) / 63
  out[o + 2] = ((c & 31) * 255) / 31
  out[o + 3] = 255
}

/** Decodes DXT1 (dxt5 = false) or DXT5 blocks into RGBA. */
export function decodeDxt(data, width, height, dxt5) {
  const out = new Uint8Array(width * height * 4)
  const palette = new Uint8Array(16)
  const alphas = new Uint8Array(8)
  let o = 0
  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      let alphaBits = 0n
      if (dxt5) {
        const a0 = data[o]
        const a1 = data[o + 1]
        alphas[0] = a0
        alphas[1] = a1
        if (a0 > a1) for (let i = 0; i < 6; i++) alphas[2 + i] = ((6 - i) * a0 + (1 + i) * a1) / 7
        else {
          for (let i = 0; i < 4; i++) alphas[2 + i] = ((4 - i) * a0 + (1 + i) * a1) / 5
          alphas[6] = 0
          alphas[7] = 255
        }
        for (let i = 5; i >= 0; i--) alphaBits = (alphaBits << 8n) | BigInt(data[o + 2 + i])
        o += 8
      }
      const c0 = data[o] | (data[o + 1] << 8)
      const c1 = data[o + 2] | (data[o + 3] << 8)
      const idx =
        (data[o + 4] | (data[o + 5] << 8) | (data[o + 6] << 16) | (data[o + 7] << 24)) >>> 0
      o += 8
      rgb565(c0, palette, 0)
      rgb565(c1, palette, 4)
      const fourColors = c0 > c1 || dxt5
      for (let k = 0; k < 3; k++) {
        const a = palette[k]
        const b = palette[4 + k]
        palette[8 + k] = fourColors ? (2 * a + b) / 3 : (a + b) / 2
        palette[12 + k] = fourColors ? (a + 2 * b) / 3 : 0
      }
      palette[11] = 255
      palette[15] = fourColors ? 255 : 0
      for (let i = 0; i < 16; i++) {
        const x = bx + (i & 3)
        const y = by + (i >> 2)
        if (x >= width || y >= height) continue
        const p = ((idx >>> (2 * i)) & 3) * 4
        const t = (y * width + x) * 4
        out[t] = palette[p]
        out[t + 1] = palette[p + 1]
        out[t + 2] = palette[p + 2]
        out[t + 3] = dxt5 ? alphas[Number((alphaBits >> BigInt(3 * i)) & 7n)] : palette[p + 3]
      }
    }
  }
  return out
}

/**
 * Parses a `.tex` file into `{ width, height, rgba, alpha, format, frames }`.
 * `alpha` is true when the texture carries a meaningful alpha channel.
 */
export function parseTexture(buffer) {
  const tdat = readTdat(buffer)
  const frmc = buffer.indexOf('FRMC')
  if (frmc >= 0) {
    const r = new Reader(buffer, frmc + 4)
    const total = r.u32()
    const sizes = []
    const start = r.o
    while (r.o < start + total) {
      const size = r.u32()
      sizes.push(size)
      r.o += size
    }
    const { width, height, dxt5 } = dxtDims(sizes, tdat)
    const rgba = decodeDxt(buffer.subarray(start + 4, start + 4 + sizes[0]), width, height, dxt5)
    return {
      width,
      height,
      rgba,
      alpha: hasTransparency(rgba),
      format: dxt5 ? 'DXT5' : 'DXT1',
      frames: tdat?.frames ?? 1,
    }
  }
  const frms = buffer.indexOf('FRMS')
  if (frms < 0 || !tdat) throw new Error('no FRMS/FRMC frame data')
  const { width, height } = tdat
  const bpp = tdat.flags & 1 ? 4 : 3
  const raw = buffer.subarray(frms + 4, frms + 4 + width * height * bpp) // first frame only
  if (raw.length < width * height * bpp) throw new Error('truncated FRMS data')
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += bpp) {
    rgba[i] = raw[j]
    rgba[i + 1] = raw[j + 1]
    rgba[i + 2] = raw[j + 2]
    rgba[i + 3] = bpp === 4 ? raw[j + 3] : 255
  }
  return {
    width,
    height,
    rgba,
    alpha: bpp === 4 && hasTransparency(rgba),
    format: bpp === 4 ? 'RGBA' : 'RGB',
    frames: tdat.frames,
  }
}

function hasTransparency(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true
  return false
}
