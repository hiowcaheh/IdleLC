import type { LcIconSheet } from './lcTypes.ts'

export interface IconSprite {
  url: string
  /** Offset of the icon in the sheet, in pixels. */
  x: number
  y: number
  size: number
  sheetWidth: number
  sheetHeight: number
}

/** Position of an icon in a sprite sheet written by convert-lc, or null when it has none. */
export function iconSprite(sheet: LcIconSheet | undefined, id: number | string): IconSprite | null {
  const index = sheet?.icons[id]
  if (!sheet || index === undefined) return null
  const { size, columns } = sheet
  return {
    url: `${import.meta.env.BASE_URL}${sheet.file}`,
    x: (index % columns) * size,
    y: Math.floor(index / columns) * size,
    size,
    sheetWidth: sheet.width,
    sheetHeight: sheet.height,
  }
}
