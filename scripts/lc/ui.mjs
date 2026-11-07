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
 * icon made transparent), `minAlpha` (fainter pixels made fully transparent: the atlas's
 * see-through halo around a piece, which shows as a lighter box on dark windows).
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
  // UIMap.cpp m_rtSubZone[DUNGEON]: the world map's dungeon mark (crossed swords over a stairway),
  // put in a quick-menu button frame by dungeon-art.mjs so it matches the other menu buttons.
  'menu-dungeons': [atlas('Map'), 67, 91, 32, 36, { scale: 2 }],
  // UIPlayerInfo.cpp m_btnQuickMenu: a 22 × 22 TopUI quick-menu button (System), for its frame.
  'menu-frame': [atlas('TopUI'), 156, 222, 22, 22],
  // the client's option sliders (NewOption.tex): the metal track and the gold thumb above it
  'slider-track': [atlas('NewOption'), 11, 447, 192, 6, { scale: 2 }],
  'slider-thumb': [atlas('NewOption'), 283, 5, 17, 10, { scale: 4 }],
  // EventBtn0's first square: the frame of the client's event / notice buttons on the right
  'event-frame': [atlas('EventBtn0'), 0, 0, 32, 32],
  // the item shop (Cashshop.tex): category pictures, NEW / HOT tags and the item frame
  'cash-hot': [atlas('Cashshop'), 0, 357, 60, 60],
  'cash-items': [atlas('Cashshop'), 63, 357, 60, 60],
  'cash-packages': [atlas('Cashshop'), 252, 357, 60, 60],
  'cash-potions': [atlas('Cashshop'), 0, 420, 60, 60],
  'cash-tag-new': [atlas('Cashshop'), 183, 501, 22, 11, { scale: 3 }],
  'cash-tag-hot': [atlas('Cashshop'), 208, 501, 22, 11, { scale: 3 }],
  'cash-slot': [atlas('Cashshop'), 217, 153, 72, 69, { scale: 2 }],
  // the shop list's item panel (gold-trimmed head strip), the gold-ended Cash bar, its blue
  // button (normal / pressed), an icon slot, the D.C. tag and the cards picture (SALE)
  'cash-card': [atlas('Cashshop'), 0, 152, 213, 76, { scale: 2 }],
  'cash-bar': [atlas('Cashshop'), 48, 490, 131, 22, { scale: 2 }],
  'cash-button': [atlas('Cashshop'), 249, 235, 65, 21, { scale: 2 }],
  'cash-button-down': [atlas('Cashshop'), 249, 258, 65, 21, { scale: 2 }],
  'cash-icon-slot': [atlas('Cashshop'), 0, 236, 34, 34, { scale: 2 }],
  'cash-tag-dc': [atlas('Cashshop'), 233, 501, 22, 11, { scale: 3 }],
  'cash-sale': [atlas('Cashshop'), 126, 357, 60, 60],
  // the dungeon's loot: the icon of t_item 298 Old Pouch (ItemBtn1, row 7, column 13), a pouch the
  // Harpy Queen of Dratan drops, so it is not the field's Inventory button (owner's choice)
  'menu-dungeon-loot': [atlas('ItemBtn1'), 416, 224, 32, 32, { scale: 4 }],
  // UIRadar.cpp _createTrophyData: the Royal Rumble winner's trophy (trophy.tex), for the ranking.
  trophy: [atlas('trophy'), 21, 19, 330, 307, { quality: 90 }],
  // questView.xml btn_left / btn_right, normal UV state.
  'page-left': [atlas('Quest'), 193, 944, 11, 15, { scale: 4 }],
  'page-right': [atlas('Quest'), 207, 944, 11, 15, { scale: 4 }],
  // actions.lod action 49 opens Titles: ActionBtn0, row 6, column 0 (32 px cells).
  'menu-titles': [atlas('ActionBtn0'), 0, 192, 32, 32, { scale: 4 }],
  // UIManager.cpp / ActorMgr.cpp: the three slices of the normal player name and title backgrounds.
  'name-frame': [atlas('NamePopup'), 0, 14, 32, 15],
  'title-frame': [atlas('NamePopup'), 35, 31, 32, 13],
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
  // GameMP/Map.cpp:79–89 supplies source UV rectangles, not the drawn screen widths.
  'loading-track': [loading('LoadingBar'), 0, 0, 11, 11],
  'loading-fill': [loading('ProgressBar'), 0, 0, 62, 17],
  // the character window's value box
  'value-box': [atlas('NewCharacterInfo'), 100, 47, 129, 15],
  // Cashshop's original 3D fitting-room backdrop, including its ornate corners and blue portal.
  'model-preview': [atlas('Cashshop'), 368, 257, 144, 255, { quality: 90 }],
  // skill_new.xml: img_base, the class tabs and the active/passive icon surrounds.
  'skills-window': [atlas('skill_new'), 401, 0, 800, 590],
  'skills-tab': [atlas('skill_new'), 1463, 1, 115, 38],
  'skills-tab-active': [atlas('skill_new'), 1235, 1, 110, 38],
  'skills-slot-active': [atlas('skill_new'), 1273, 43, 44, 58],
  'skills-slot-passive': [atlas('skill_new'), 1324, 43, 44, 58],
  'skills-sp': [atlas('skill_new'), 841, 546, 162, 23],
  'skills-background': [atlas('skill_new'), 420, 80, 380, 450, { quality: 85 }],
  // Original panels and controls, measured on the 2015 atlases.
  'settings-window': [atlas('NewOption'), 0, 0, 256, 400],
  // NewOption: the option window's check box (red when on), the same box empty, and its page's
  // silver divider between groups of settings
  check: [atlas('NewOption'), 287, 30, 14, 14, { scale: 3 }],
  'check-off': [atlas('NewOption'), 287, 30, 14, 14, { scale: 3 }],
  divider: [atlas('NewOption'), 11, 447, 192, 6],
  'book-window': [atlas('QuestBook'), 0, 0, 475, 331],
  'detail-window': [atlas('NewOption'), 270, 105, 178, 190],
  'client-section': [atlas('QuestBook'), 0, 346, 155, 32],
  'book-paper': [atlas('ItemCollectionbook'), 246, 58, 480, 466, { quality: 85 }],
  'book-row': [atlas('ItemCollectionbook'), 13, 246, 193, 16],
  'book-progress': [atlas('ItemCollectionbook'), 471, 778, 270, 34, { minAlpha: 96 }],
  'book-fill': [atlas('ItemCollectionbook'), 32, 799, 168, 19],
  gift: [atlas('Cashshop'), 251, 358, 60, 60],
  'stat-plus': [atlas('skill_new'), 1213, 70, 13, 13, { scale: 3 }],
  'stat-plus-disabled': [atlas('skill_new'), 1213, 98, 13, 13, { scale: 3 }],
  'sp-icon': [atlas('skill_new'), 844, 548, 20, 20, { scale: 3 }],
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
  'settings-window': [
    [0, 37, 1],
    [365, 1, 16],
    [390, 10, 1],
  ],
  'book-window': [
    [0, 37, 1],
    [300, 1, 16],
    [321, 10, 1],
  ],
  'detail-window': [
    [0, 37, 1],
    [150, 1, 16],
    [180, 10, 1],
  ],
  'skills-window': [
    [0, 37, 1],
    [100, 1, 16],
    [580, 10, 1],
  ],
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

/** The original left/centre/right UV slices, joined without unrelated atlas pixels between them. */
const COLUMNS = {
  'loading-fill': [
    [0, 36],
    [49, 13],
  ],
  'name-frame': [
    [0, 2],
    [4, 10],
    [30, 2],
  ],
  'title-frame': [
    [0, 2],
    [4, 10],
    [30, 2],
  ],
}

/**
 * The bottom edge is stretched across the whole window, so its middle (between the 8 px corners) is
 * one column repeated — the texture's streaks would show as long smears: [rows from the bottom, column].
 */
const FLAT_BOTTOM = { window: [10, 128], panel: [10, 128], 'book-window': [10, 350] }
const CORNER = 8

/** Parts of a piece shown empty: the player frame's bar tracks (the bars are drawn on top). */
const EMPTY_AREAS = {
  'book-progress': [[20, 9, 230, 14]],
  // the box without its red mark
  'check-off': [[3, 3, 8, 8]],
  'player-frame': [
    [112, 31, 118, 8],
    [112, 44, 118, 8],
    [112, 57, 118, 8],
  ],
}
/**
 * Areas [x, y, width, height] of a piece replaced by the mirror image of its other side: the
 * skill window's own close button (skill_new.xml btn_close at 780,5 16×16) is baked into img_base,
 * and the game draws the windows' close button itself; the frame is symmetric.
 */
const MIRRORED = {
  'skills-window': [[776, 2, 24, 22]],
}
/** Brightness left in an empty bar track (grey, so it never looks like a dark fill). */
const EMPTY_SHADE = 0.22

/** The pieces as lossless WebP images: { name: Buffer }; pieces whose atlas is missing are left out. */
export async function buildUiParts(files) {
  const textures = new Map()
  const out = {}
  for (const [name, [path, x, y, rectWidth, rectHeight, options = {}]] of Object.entries(
    UI_PARTS,
  )) {
    const { scale = 1, quality, keyOut = false, minAlpha = 0 } = options
    let height = rectHeight
    if (!textures.has(path)) {
      textures.set(path, files.resolve(path) ? parseTexture(files.read(path)) : null)
    }
    const texture = textures.get(path)
    if (!texture) continue
    if (
      ![x, y, rectWidth, rectHeight].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      rectWidth <= 0 ||
      rectHeight <= 0 ||
      x + rectWidth > texture.width ||
      y + rectHeight > texture.height
    ) {
      throw new Error(
        `UI part ${name}: rectangle ${x},${y} ${rectWidth}x${rectHeight} exceeds ${path} ${texture.width}x${texture.height}`,
      )
    }
    const columns = COLUMNS[name]?.flatMap(([first, count]) =>
      Array.from({ length: count }, (_, i) => first + i),
    )
    const width = columns?.length ?? rectWidth
    const rows = (ROWS[name] ?? [[0, height, 1]]).flatMap(([first, count, times]) =>
      Array.from({ length: count * times }, (_, i) => first + (i % count)),
    )
    height = rows.length
    const pixels = Buffer.alloc(width * height * 4)
    rows.forEach((source, row) => {
      if (source < 0 || source >= rectHeight)
        throw new Error(`UI part ${name}: row ${source} out of range`)
      if (columns) {
        columns.forEach((column, col) => {
          if (column < 0 || column >= rectWidth)
            throw new Error(`UI part ${name}: column ${column} out of range`)
          const from = ((y + source) * texture.width + x + column) * 4
          pixels.set(texture.rgba.subarray(from, from + 4), (row * width + col) * 4)
        })
      } else {
        const from = ((y + source) * texture.width + x) * 4
        pixels.set(texture.rgba.subarray(from, from + width * 4), row * width * 4)
      }
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
    for (const [mx, my, mw, mh] of MIRRORED[name] ?? []) {
      for (let row = my; row < my + mh; row++) {
        for (let col = mx; col < mx + mw; col++) {
          const from = (row * width + (width - 1 - col)) * 4
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
    if (minAlpha > 0) {
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < minAlpha) pixels[i] = 0
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
