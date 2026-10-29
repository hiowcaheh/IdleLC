import type { ItemType } from '../../game/data/types.ts'

/** Simple glyph per item type until the icons from the LC atlases are converted. */
const GLYPHS: Record<ItemType, string> = {
  weapon: 'M6 18 L16 8 M14 6 L18 10 M5 15 L9 19 M4 20 L6 18',
  armor: 'M7 5 L12 7 L17 5 L19 9 L17 10 V19 H7 V10 L5 9 Z',
  accessory: 'M12 7 a5 5 0 1 0 0.01 0 M10 4 L12 7 L14 4',
  scroll:
    'M7 6 H16 a2 2 0 0 1 0 4 H8 V18 a2 2 0 0 1 -2 -2 V8 a2 2 0 0 1 1 -2 M10 13 H15 M10 16 H14',
  potion: 'M10 4 H14 M11 4 V9 L7 16 a2 2 0 0 0 2 3 H15 a2 2 0 0 0 2 -3 L13 9 V4',
  material: 'M12 4 L18 9 L15 19 H9 L6 9 Z M6 9 H18 M12 4 L10 9 L12 19 L14 9 Z',
  other: 'M8 8 H16 V16 H8 Z',
}

export function ItemIcon({ type }: { type: ItemType }) {
  return (
    <span className={`item-icon item-icon--${type}`} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={GLYPHS[type]} />
      </svg>
    </span>
  )
}
