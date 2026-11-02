/**
 * LC/Serious Engine texture `.tex` reader: TDAT header (encrypted in LC, plain in SE),
 * FRMS raw RGB/RGBA frames or FRMC DXT1/DXT3/DXT5 mip chains. Returns the first frame / mip 0 as RGBA.
 * See docs/lc-formats.md.
 */
import { Reader, TEXTURE_KEY } from './binary.mjs'

/** Read header chunks in order; four-character strings inside pixels are not chunk IDs.
 * Source: Engine/Graphics/Texture.cpp, CTextureData::Read_t.
 */
function textureHeader(buffer) {
  const r = new Reader(buffer)
  if (r.id() !== 'TVER') throw new Error('not a TVER texture')
  const storedVersion = r.u32()
  const version = (storedVersion & 0xffff) === 5 ? 4 : storedVersion & 0xffff
  const encoding = (storedVersion & 0xffff) === 5 ? 5 : storedVersion >>> 16
  if (version !== 3 && version !== 4) throw new Error(`unsupported texture version ${version}`)
  if (![0, 1, 5].includes(encoding)) throw new Error(`unsupported texture encoding ${encoding}`)
  if (r.id() !== 'TDAT') throw new Error('expected TDAT texture header')
  let flags, mexW, mexH, mips, shift, frames, frameSize
  if (encoding) {
    // DecodeSimpleTex starts its checker at the high TVER word (1, or 5 in the newer variant).
    r.key = {
      bytes: Uint8Array.from(TEXTURE_KEY.bytes, (byte) => (byte + encoding - 1) & 0xff),
      step: TEXTURE_KEY.step,
    }
    ;[mexW, shift, mexH, mips, flags, frames] = Array.from({ length: 6 }, () => r.xint())
    if (version === 3) {
      r.u32() // stored mip count
      frameSize = r.u32()
    }
  } else {
    flags = r.u32()
    mexW = r.u32()
    mexH = r.u32()
    mips = r.u32()
    if (version === 3) r.u32() // stored mip count
    shift = r.u32()
    if (version === 3) frameSize = r.u32()
    frames = r.u32()
  }
  if (shift > 30) throw new Error(`invalid texture mip shift ${shift}`)
  const width = Math.floor(mexW / 2 ** shift)
  const height = Math.floor(mexH / 2 ** shift)
  validateDimensions(width, height)
  if (mips > 32 || frames < 1)
    throw new Error(`invalid texture counts ${mips} mips, ${frames} frames`)
  return { r, data: { width, height, mips, flags, frames, version, frameSize } }
}

/** TDAT metadata (v3/v4, plain Serious Engine or LC encoded). */
export function readTdat(buffer) {
  return textureHeader(buffer).data
}

function validateDimensions(width, height) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 64 * 1024 * 1024
  )
    throw new Error(`invalid texture dimensions ${width} × ${height}`)
}

const blocks = (w, h) => Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4))

/** Finds (width, height, dxt5) whose DXT mip chain matches the stored mip sizes. */
export function dxtDims(sizes, hint = null) {
  if (hint) {
    for (const dxt5 of [false, true]) {
      if (
        sizes.length > 0 &&
        sizes.every(
          (size, level) =>
            size ===
            blocks(Math.max(1, hint.width >> level), Math.max(1, hint.height >> level)) *
              (dxt5 ? 16 : 8),
        )
      )
        return { width: hint.width, height: hint.height, dxt5 }
    }
  }
  if (hint) throw new Error('DXT mip sizes do not match TDAT dimensions')
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

/** Decodes DXT1 (false), DXT5 (true), or DXT3 ('DXT3') blocks into RGBA. */
export function decodeDxt(data, width, height, dxt5) {
  validateDimensions(width, height)
  const dxt3 = dxt5 === 'DXT3'
  const wide = dxt5 || dxt3
  if (data.length !== blocks(width, height) * (wide ? 16 : 8))
    throw new Error('invalid DXT block data length')
  const out = new Uint8Array(width * height * 4)
  const palette = new Uint8Array(16)
  const alphas = new Uint8Array(8)
  let o = 0
  for (let by = 0; by < height; by += 4) {
    for (let bx = 0; bx < width; bx += 4) {
      let alphaBits = 0n
      if (dxt3) {
        for (let i = 7; i >= 0; i--) alphaBits = (alphaBits << 8n) | BigInt(data[o + i])
        o += 8
      } else if (dxt5) {
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
      const fourColors = c0 > c1 || wide
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
        out[t + 3] = dxt3
          ? Number((alphaBits >> BigInt(4 * i)) & 15n) * 17
          : dxt5
            ? alphas[Number((alphaBits >> BigInt(3 * i)) & 7n)]
            : palette[p + 3]
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
  const { r, data: tdat } = textureHeader(buffer)
  const chunk = r.id()
  const { width, height, frames } = tdat
  if (chunk === 'FRMC') {
    const frameSize = r.u32()
    if (frameSize < 4) throw new Error('invalid FRMC frame size')
    r.require(frameSize * frames)
    const frameEnd = r.o + frameSize
    const sizes = []
    const first = r.o + 4
    while (r.o < frameEnd) {
      if (frameEnd - r.o < 4) throw new Error('truncated FRMC mip size')
      const size = r.u32()
      if (!size || size > frameEnd - r.o || sizes.length >= 32)
        throw new Error(`invalid FRMC mip size ${size}`)
      sizes.push(size)
      r.bytes(size)
    }
    const { dxt5: wide } = dxtDims(sizes, tdat)
    // DXT1 may have binary alpha; 16-byte blocks use explicit DXT3 alpha unless flag32 selects DXT5.
    const format = !wide ? 'DXT1' : tdat.flags & 32 ? 'DXT5' : 'DXT3'
    const rgba = decodeDxt(
      buffer.subarray(first, first + sizes[0]),
      width,
      height,
      format === 'DXT3' ? 'DXT3' : format === 'DXT5',
    )
    return { width, height, rgba, alpha: hasTransparency(rgba), format, frames }
  }
  if (chunk !== 'FRMS') throw new Error(`unsupported texture frame chunk ${chunk}`)
  const firstMipBytes = width * height * (tdat.version === 3 ? 2 : tdat.flags & 1 ? 4 : 3)
  r.require(firstMipBytes * frames)
  const rgba = new Uint8Array(width * height * 4)
  if (tdat.version === 3) {
    // Version 3 stores 16-bit pixels and all mipmaps; Convert() unpacks only mip zero.
    const firstMipSize = width * height * 2
    if (tdat.frameSize < firstMipSize) throw new Error('invalid version 3 frame size')
    r.require(tdat.frameSize * frames)
    const alpha = Boolean(tdat.flags & 1)
    for (let i = 0; i < rgba.length; i += 4) {
      const pixel = r.u16()
      if (alpha) {
        rgba[i] = ((pixel >>> 12) & 15) * 17
        rgba[i + 1] = ((pixel >>> 8) & 15) * 17
        rgba[i + 2] = ((pixel >>> 4) & 15) * 17
        rgba[i + 3] = (pixel & 15) * 17
      } else {
        // RGB5551 (low bit unused); expand exactly as the original Convert().
        const red = (pixel & 0xf800) >>> 8
        const green = (pixel & 0x07c0) >>> 3
        const blue = (pixel & 0x003e) << 2
        rgba[i] = red | (red >>> 5)
        rgba[i + 1] = green | (green >>> 5)
        rgba[i + 2] = blue | (blue >>> 5)
        rgba[i + 3] = 255
      }
    }
    return {
      width,
      height,
      rgba,
      alpha: alpha && hasTransparency(rgba),
      format: alpha ? 'RGBA4444' : 'RGB5551',
      frames,
    }
  }
  const bpp = tdat.flags & 1 ? 4 : 3
  r.require(width * height * bpp * frames)
  const raw = r.bytes(width * height * bpp) // first frame only
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
    frames,
  }
}

function hasTransparency(rgba) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) return true
  return false
}
