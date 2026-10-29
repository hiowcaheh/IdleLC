/**
 * Interface pieces cut from the client's UI atlases into public/ui/lc/ (window frame, title bar,
 * buttons, item slot, player frame). The game's CSS stretches them as 9-slice borders.
 * The Nemesis client stores its interface encrypted; these atlases come from the 2015 client.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

const atlas = (name) => `Data\\Interface\\${name}.tex`

/** name → [atlas, x, y, width, height] (rectangles measured on the atlases). */
export const UI_PARTS = {
  window: [atlas('NewInventory'), 0, 0, 256, 408],
  slot: [atlas('NewInventory'), 39, 218, 34, 34],
  title: [atlas('MessageBox'), 0, 0, 216, 23],
  close: [atlas('MessageBox'), 220, 1, 14, 14],
  button: [atlas('MessageBox'), 0, 116, 131, 21],
  'button-small': [atlas('MessageBox'), 0, 46, 63, 21],
  'player-frame': [atlas('TopUI'), 0, 0, 277, 93],
}

/** The pieces as lossless WebP images: { name: Buffer }; pieces whose atlas is missing are left out. */
export async function buildUiParts(files) {
  const textures = new Map()
  const out = {}
  for (const [name, [path, x, y, width, height]] of Object.entries(UI_PARTS)) {
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
    out[name] = await sharp(pixels, { raw: { width, height, channels: 4 } })
      .webp({ lossless: true })
      .toBuffer()
  }
  return out
}
