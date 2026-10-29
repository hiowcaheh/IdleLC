/**
 * Item icons: cuts the 32×32 cells that t_item points at (a_texture_id → Data\Interface\ItemBtn{id}.tex,
 * a_texture_row / a_texture_col) into one sprite sheet. Items that share an icon share a cell.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

export const ICON_SIZE = 32
export const SHEET_COLUMNS = 32

/**
 * @param files  ClientFiles / MemoryFiles
 * @param items  lc-data.json items ({ id, icon: { atlas, row, col } })
 * @returns {{ image: Buffer | null, manifest: object, missingAtlases: number[] }}
 */
export async function buildItemIconSheet(files, items) {
  const atlases = new Map()
  const cells = new Map()
  const iconOf = {}
  const missing = new Set()

  const atlasAt = (id) => {
    if (!atlases.has(id)) {
      const path = `Data\\Interface\\ItemBtn${id}.tex`
      atlases.set(id, files.resolve(path) ? parseTexture(files.read(path)) : null)
    }
    return atlases.get(id)
  }

  for (const item of items) {
    const { atlas, row, col } = item.icon
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
    iconOf[item.id] = cells.get(key)
  }

  const width = SHEET_COLUMNS * ICON_SIZE
  const height = Math.max(1, Math.ceil(cells.size / SHEET_COLUMNS)) * ICON_SIZE
  const manifest = {
    file: 'icons/lc/items.webp',
    size: ICON_SIZE,
    columns: SHEET_COLUMNS,
    width,
    height,
    items: iconOf,
  }
  if (cells.size === 0)
    return { image: null, manifest, missingAtlases: [...missing].sort((a, b) => a - b) }

  const sheet = Buffer.alloc(width * height * 4)
  for (const [key, index] of cells) {
    const [atlas, row, col] = key.split('/').map(Number)
    const texture = atlases.get(atlas)
    const dx = (index % SHEET_COLUMNS) * ICON_SIZE
    const dy = Math.floor(index / SHEET_COLUMNS) * ICON_SIZE
    for (let y = 0; y < ICON_SIZE; y++) {
      const from = ((row * ICON_SIZE + y) * texture.width + col * ICON_SIZE) * 4
      sheet.set(texture.rgba.subarray(from, from + ICON_SIZE * 4), ((dy + y) * width + dx) * 4)
    }
  }
  const image = await sharp(sheet, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90 })
    .toBuffer()
  return { image, manifest, missingAtlases: [...missing].sort((a, b) => a - b) }
}
