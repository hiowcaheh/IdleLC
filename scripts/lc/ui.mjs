/**
 * Interface pieces cut from the client's UI atlases into public/ui/lc/ (window frame, title bar,
 * buttons, item slot, player frame and its HP / MP / EXP bars). The game's CSS stretches them as
 * 9-slice borders. The Nemesis client stores its interface encrypted; these atlases come from the
 * 2015 client.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

const atlas = (name) => `Data\\Interface\\${name}.tex`
const loading = (name) => `Data\\Interface\\Loading\\${name}.tex`

/**
 * name → [atlas, x, y, width, height, options?] (rectangles measured on the atlases); options:
 * `scale` (upscaled once here, sharpened so small icons stay crisp on phone screens), `quality`
 * (lossy WebP for pictures; the rest is lossless), `keyOut` (the dark blue background of an item
 * icon made transparent).
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
  // the client's menu buttons (22 × 22, drawn about 4× as large on phone screens: upscaled here once)
  'menu-character': [atlas('TopUI'), 0, 222, 22, 22, { scale: 4 }],
  'menu-inventory': [atlas('TopUI'), 26, 222, 22, 22, { scale: 4 }],
  // the book with a quill (the owner's pick for the Skills window)
  'menu-skills': [atlas('TopUI'), 0, 170, 22, 22, { scale: 4 }],
  'menu-system': [atlas('TopUI'), 156, 222, 22, 22, { scale: 4 }],
  // the scroll with red writing: the Titles window
  'menu-titles': [atlas('TopUI'), 130, 222, 22, 22, { scale: 4 }],
  // the Gold Coin item's icon (t_item 19: ItemBtn0, row 0, column 0) without its frame and background
  coin: [atlas('ItemBtn0'), 2, 2, 28, 28, { scale: 4, keyOut: true }],
  // a round button with a bronze rim and a black middle: the counter badge on buttons
  badge: [atlas('TopUI'), 734, 711, 25, 25, { scale: 3 }],
  // loading screens of the zones in the game (Data\Interface\Loading\F_0n), cut inside their ragged
  // black border and above the publisher's emblem; the bar's track and fill
  'loading-juno': [loading('F_01'), 40, 16, 944, 344, { quality: 78 }],
  'loading-dratan': [loading('F_02'), 40, 16, 944, 344, { quality: 78 }],
  'loading-merac': [loading('F_03'), 40, 16, 944, 344, { quality: 78 }],
  'loading-egeha': [loading('F_04'), 40, 16, 944, 344, { quality: 78 }],
  'loading-track': [loading('LoadingBar'), 0, 0, 729, 13],
  'loading-fill': [loading('ProgressBar'), 0, 0, 927, 17],
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
 * keep only a clean row of the sides (y 380: outline, gilt line, steel), so no black strip shows. The
 * bottom edge starts below the bag's outline (y 401: steel, gilt line, shadow), its top row repeated.
 * window: the title edge (37 rows) and the bottom; panel: a thin top edge.
 */
const ROWS = {
  window: [
    [0, 37, 1],
    [380, 1, 16],
    [401, 1, 4],
    [402, 6, 1],
  ],
  panel: [
    [0, 10, 1],
    [380, 1, 16],
    [401, 1, 4],
    [402, 6, 1],
  ],
}

/**
 * The bottom edge is stretched across the whole window, so its middle (between the 8 px corners) is
 * one column repeated — the texture's streaks would show as long smears: [rows from the bottom, column].
 */
const FLAT_BOTTOM = { window: [10, 128], panel: [10, 128] }
const CORNER = 8

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
    const { scale = 1, quality, keyOut = false } = options
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
    if (FLAT_BOTTOM[name]) {
      const [count, column] = FLAT_BOTTOM[name]
      for (let row = height - count; row < height; row++) {
        const from = (row * width + column) * 4
        for (let col = CORNER; col < width - CORNER; col++) {
          pixels.copyWithin((row * width + col) * 4, from, from + 4)
        }
      }
    }
    for (const [ex, ey, ew, eh] of EMPTY_AREAS[name] ?? []) {
      for (let row = ey; row < ey + eh; row++) {
        for (let col = ex; col < ex + ew; col++) {
          const i = (row * width + col) * 4
          const grey = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
          for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(grey * EMPTY_SHADE)
        }
      }
    }
    if (keyOut) {
      // gold on dark blue: the more blue than red a pixel is, the more transparent
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i + 3] = Math.max(0, Math.min(255, (pixels[i] - pixels[i + 2] - 10) * 3))
      }
    }
    let image = sharp(pixels, { raw: { width, height, channels: 4 } })
    if (scale !== 1) {
      image = image
        .resize(width * scale, height * scale, { kernel: 'mitchell' })
        .sharpen({ sigma: 1.2, m1: 1, m2: 3 })
    }
    out[name] = await image.webp(quality ? { quality } : { lossless: true }).toBuffer()
  }
  return out
}
