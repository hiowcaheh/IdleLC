/**
 * Interface pieces cut from the client's UI atlases into public/ui/lc/ (window frame, title bar,
 * buttons, item slot, player frame and its HP / MP / EXP bars). The game's CSS stretches them as
 * 9-slice borders. The Nemesis client stores its interface encrypted; these atlases come from the
 * 2015 client.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

const atlas = (name) => `Data\\Interface\\${name}.tex`

/** name → [atlas, x, y, width, height, scale?] (rectangles measured on the atlases). */
export const UI_PARTS = {
  window: [atlas('NewInventory'), 0, 0, 256, 408],
  slot: [atlas('NewInventory'), 39, 218, 34, 34],
  title: [atlas('MessageBox'), 0, 0, 216, 23],
  close: [atlas('MessageBox'), 220, 1, 14, 14],
  button: [atlas('MessageBox'), 0, 116, 131, 21],
  'button-small': [atlas('MessageBox'), 0, 46, 63, 21],
  'player-frame': [atlas('TopUI'), 0, 0, 277, 93],
  // the full HP, MP and EXP bars inside the player frame; the game draws them over empty tracks
  'bar-hp': [atlas('TopUI'), 112, 31, 118, 8],
  'bar-mp': [atlas('TopUI'), 112, 44, 118, 8],
  'bar-exp': [atlas('TopUI'), 112, 57, 118, 8],
  // the client's menu buttons (22 × 22, drawn twice as large on phones: upscaled here once)
  'menu-character': [atlas('TopUI'), 0, 222, 22, 22, 2],
  'menu-inventory': [atlas('TopUI'), 26, 222, 22, 22, 2],
  'menu-skills': [atlas('TopUI'), 52, 222, 22, 22, 2],
  'menu-system': [atlas('TopUI'), 156, 222, 22, 22, 2],
}

/** Parts of a piece shown empty: the player frame's bar tracks (the bars are drawn on top). */
const EMPTY_AREAS = {
  'player-frame': [
    [112, 31, 118, 8],
    [112, 44, 118, 8],
    [112, 57, 118, 8],
  ],
}
/** Brightness left in an empty bar track. */
const EMPTY_SHADE = 0.15

/** The pieces as lossless WebP images: { name: Buffer }; pieces whose atlas is missing are left out. */
export async function buildUiParts(files) {
  const textures = new Map()
  const out = {}
  for (const [name, [path, x, y, width, height, scale = 1]] of Object.entries(UI_PARTS)) {
    if (!textures.has(path)) {
      textures.set(path, files.resolve(path) ? parseTexture(files.read(path)) : null)
    }
    const texture = textures.get(path)
    if (!texture) continue
    const pixels = Buffer.alloc(width * height * 4)
    for (let row = 0; row < height; row++) {
      const from = ((y + row) * texture.width + x) * 4
      pixels.set(texture.rgba.subarray(from, from + width * 4), row * width * 4)
    }
    for (const [ex, ey, ew, eh] of EMPTY_AREAS[name] ?? []) {
      for (let row = ey; row < ey + eh; row++) {
        for (let col = ex; col < ex + ew; col++) {
          const i = (row * width + col) * 4
          for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(pixels[i + c] * EMPTY_SHADE)
        }
      }
    }
    let image = sharp(pixels, { raw: { width, height, channels: 4 } })
    if (scale !== 1) {
      image = image.resize(width * scale, height * scale, { kernel: 'lanczos3' })
    }
    out[name] = await image.webp({ lossless: true }).toBuffer()
  }
  return out
}
