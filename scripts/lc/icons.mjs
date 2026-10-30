/**
 * Icons: cuts the 32×32 atlas cells the database points at into one sprite sheet per kind.
 * Items: t_item a_texture_id/row/col → Data\Interface\ItemBtn{id}.tex.
 * Skills: t_skill a_client_icon_texid/row/col → Data\Interface\SkillBtn{id}.tex.
 * Entries that share an icon share a cell.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

export const ICON_SIZE = 32
export const SHEET_COLUMNS = 32

/**
 * @param files    ClientFiles / MemoryFiles
 * @param entries  [{ id, icon: { atlas, row, col } }]
 * @param atlasPath  atlas id → client path of the .tex atlas
 * @param file     published path of the sheet (relative to public/)
 * @returns {{ image: Buffer | null, sheet: object, missingAtlases: number[] }}
 */
export async function buildIconSheet(files, entries, atlasPath, file) {
  const atlases = new Map()
  const cells = new Map()
  const icons = {}
  const missing = new Set()

  const atlasAt = (id) => {
    if (!atlases.has(id)) {
      const path = atlasPath(id)
      atlases.set(id, files.resolve(path) ? parseTexture(files.read(path)) : null)
    }
    return atlases.get(id)
  }

  for (const entry of entries) {
    const { atlas, row, col } = entry.icon
    const key = `${atlas}/${row}/${col}`
    if (!cells.has(key)) {
      const texture = atlasAt(atlas)
      const fits =
        texture && (col + 1) * ICON_SIZE <= texture.width && (row + 1) * ICON_SIZE <= texture.height
      if (!fits) {
        missing.add(atlas)
        continue
      }
      cells.set(key, cells.size)
    }
    icons[entry.id] = cells.get(key)
  }

  const width = SHEET_COLUMNS * ICON_SIZE
  const height = Math.max(1, Math.ceil(cells.size / SHEET_COLUMNS)) * ICON_SIZE
  const sheet = { file, size: ICON_SIZE, columns: SHEET_COLUMNS, width, height, icons }
  const missingAtlases = [...missing].sort((a, b) => a - b)
  if (cells.size === 0) return { image: null, sheet, missingAtlases }

  const pixels = Buffer.alloc(width * height * 4)
  for (const [key, index] of cells) {
    const [atlas, row, col] = key.split('/').map(Number)
    const texture = atlases.get(atlas)
    const dx = (index % SHEET_COLUMNS) * ICON_SIZE
    const dy = Math.floor(index / SHEET_COLUMNS) * ICON_SIZE
    for (let y = 0; y < ICON_SIZE; y++) {
      const from = ((row * ICON_SIZE + y) * texture.width + col * ICON_SIZE) * 4
      pixels.set(texture.rgba.subarray(from, from + ICON_SIZE * 4), ((dy + y) * width + dx) * 4)
    }
  }
  const image = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90 })
    .toBuffer()
  return { image, sheet, missingAtlases }
}

/** sRGB 0…255 → linear 0…1 (glTF base colours are linear). */
const linear = (c) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/**
 * The average colour of an item icon's lit pixels (the item, not its dark background) as a linear
 * RGB glTF base colour, or null. Gear whose texture can't be read is tinted with it.
 * @param sheet   the items sheet of lc-icons.json
 * @param pixels  that sheet's image as raw RGBA
 */
export function iconColor(sheet, pixels, itemId) {
  const cell = sheet.icons[itemId]
  if (cell === undefined) return null
  const x0 = (cell % sheet.columns) * sheet.size
  const y0 = Math.floor(cell / sheet.columns) * sheet.size
  const sum = [0, 0, 0]
  let count = 0
  for (let y = 0; y < sheet.size; y++) {
    for (let x = 0; x < sheet.size; x++) {
      const i = ((y0 + y) * sheet.width + x0 + x) * 4
      const [r, g, b, a] = pixels.subarray(i, i + 4)
      const light = (r + g + b) / 3
      if (a < 128 || light < 40 || light > 235) continue
      sum[0] += r
      sum[1] += g
      sum[2] += b
      count++
    }
  }
  return count ? sum.map((v) => linear(v / count)) : null
}

export const ICON_KINDS = [
  {
    kind: 'items',
    file: 'icons/lc/items.webp',
    entries: (data) => data.items,
    atlasPath: (id) => `Data\\Interface\\ItemBtn${id}.tex`,
  },
  {
    kind: 'skills',
    file: 'icons/lc/skills.webp',
    entries: (data) => data.skills ?? [],
    atlasPath: (id) => `Data\\Interface\\SkillBtn${id}.tex`,
  },
]

/** Class portraits: the round faces in Data\Interface\TopUI.tex (78 px circles on an 86 px grid). */
export const PORTRAIT_ATLAS = 'Data\\Interface\\TopUI.tex'
export const PORTRAIT_SIZE = 78
/** Top-left corner of each class's portrait in TopUI.tex (which face is which: the owner). */
export const PORTRAITS = {
  titan: [925, 427],
  knight: [838, 341],
  healer: [751, 427],
  mage: [838, 427],
  rogue: [925, 258],
  sorcerer: [925, 341],
}

/** One sheet with the class portraits (keys: class ids), or no image without the atlas. */
export async function buildPortraitSheet(files, file) {
  const ids = Object.keys(PORTRAITS)
  const width = ids.length * PORTRAIT_SIZE
  const height = PORTRAIT_SIZE
  const icons = Object.fromEntries(ids.map((id, i) => [id, i]))
  const sheet = { file, size: PORTRAIT_SIZE, columns: ids.length, width, height, icons }
  if (!files.resolve(PORTRAIT_ATLAS)) return { image: null, sheet }
  const atlas = parseTexture(files.read(PORTRAIT_ATLAS))
  const pixels = Buffer.alloc(width * height * 4)
  ids.forEach((id, i) => {
    const [x, y] = PORTRAITS[id]
    for (let row = 0; row < PORTRAIT_SIZE; row++) {
      const from = ((y + row) * atlas.width + x) * 4
      pixels.set(
        atlas.rgba.subarray(from, from + PORTRAIT_SIZE * 4),
        (row * width + i * PORTRAIT_SIZE) * 4,
      )
    }
  })
  const image = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90 })
    .toBuffer()
  return { image, sheet }
}
