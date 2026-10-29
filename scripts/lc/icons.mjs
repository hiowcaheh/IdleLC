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
/** Top-left corner of each class's portrait in TopUI.tex (picked by eye: the class's face). */
export const PORTRAITS = {
  titan: [925, 427],
  knight: [925, 258],
  healer: [751, 427],
  mage: [925, 341],
  rogue: [838, 427],
  sorcerer: [838, 341],
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
