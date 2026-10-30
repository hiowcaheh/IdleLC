/**
 * Interface pieces cut from the client's UI atlases into public/ui/lc/ (window frame, title bar,
 * buttons, item slot, player frame and its HP / MP / EXP bars). The game's CSS stretches them as
 * 9-slice borders. The Nemesis client stores its interface encrypted; these atlases come from the
 * 2015 client.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

const atlas = (name) => `Data\\Interface\\${name}.tex`

/**
 * name → [atlas, x, y, width, height, options?] (rectangles measured on the atlases); options:
 * `scale` (upscaled once here), `quality` (lossy WebP for pictures; the rest is lossless).
 */
export const UI_PARTS = {
  window: [atlas('NewInventory'), 0, 0, 256, 408],
  panel: [atlas('NewInventory'), 0, 0, 256, 408],
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
  'menu-character': [atlas('TopUI'), 0, 222, 22, 22, { scale: 2 }],
  'menu-inventory': [atlas('TopUI'), 26, 222, 22, 22, { scale: 2 }],
  'menu-skills': [atlas('TopUI'), 52, 222, 22, 22, { scale: 2 }],
  'menu-system': [atlas('TopUI'), 156, 222, 22, 22, { scale: 2 }],
  // the character window's value box
  'value-box': [atlas('NewCharacterInfo'), 100, 47, 129, 15],
  // equipment boards: each class's silhouette with the slot frames (LC job order)
  'equip-titan': [atlas('NewInventory'), 257, 0, 246, 155, { quality: 90 }],
  'equip-knight': [atlas('NewInventory'), 504, 0, 246, 155, { quality: 90 }],
  'equip-healer': [atlas('NewInventory'), 751, 0, 246, 155, { quality: 90 }],
  'equip-mage': [atlas('NewInventory'), 257, 156, 246, 155, { quality: 90 }],
  'equip-rogue': [atlas('NewInventory'), 504, 156, 246, 155, { quality: 90 }],
  'equip-sorcerer': [atlas('NewInventory'), 751, 156, 246, 155, { quality: 90 }],
}

/**
 * Pieces put together from rows of their rectangle: [first row, rows, times]. The inventory window
 * has its item preview (black) and bag slots next to the side borders; the frames the game stretches
 * keep only a clean row of the sides (y 380: outline, gilt line, steel), so no black strip shows.
 * window: the title edge (37 rows) and the bottom; panel: a thin top edge.
 */
const ROWS = {
  window: [
    [0, 37, 1],
    [380, 1, 16],
    [398, 10, 1],
  ],
  panel: [
    [0, 10, 1],
    [380, 1, 16],
    [398, 10, 1],
  ],
}

/** Parts of a piece shown empty: the player frame's bar tracks (the bars are drawn on top). */
const EMPTY_AREAS = {
  'player-frame': [
    [112, 31, 118, 8],
    [112, 44, 118, 8],
    [112, 57, 118, 8],
  ],
}
/** Brightness left in an empty bar track (grey, so it never looks like a dark fill). */
const EMPTY_SHADE = 0.22

/** The pieces as lossless WebP images: { name: Buffer }; pieces whose atlas is missing are left out. */
export async function buildUiParts(files) {
  const textures = new Map()
  const out = {}
  for (const [name, [path, x, y, width, rectHeight, options = {}]] of Object.entries(UI_PARTS)) {
    const { scale = 1, quality } = options
    let height = rectHeight
    if (!textures.has(path)) {
      textures.set(path, files.resolve(path) ? parseTexture(files.read(path)) : null)
    }
    const texture = textures.get(path)
    if (!texture) continue
    const rows = (ROWS[name] ?? [[0, height, 1]]).flatMap(([first, count, times]) =>
      Array.from({ length: count * times }, (_, i) => first + (i % count)),
    )
    height = rows.length
    const pixels = Buffer.alloc(width * height * 4)
    rows.forEach((source, row) => {
      const from = ((y + source) * texture.width + x) * 4
      pixels.set(texture.rgba.subarray(from, from + width * 4), row * width * 4)
    })
    for (const [ex, ey, ew, eh] of EMPTY_AREAS[name] ?? []) {
      for (let row = ey; row < ey + eh; row++) {
        for (let col = ex; col < ex + ew; col++) {
          const i = (row * width + col) * 4
          const grey = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
          for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(grey * EMPTY_SHADE)
        }
      }
    }
    let image = sharp(pixels, { raw: { width, height, channels: 4 } })
    if (scale !== 1) {
      image = image.resize(width * scale, height * scale, { kernel: 'lanczos3' })
    }
    out[name] = await image.webp(quality ? { quality } : { lossless: true }).toBuffer()
  }
  return out
}
