import { itemIcon } from '../../game/data/items.ts'
import type { ItemDef, ItemType } from '../../game/data/types.ts'

/** Glyph per item type, for items whose icon atlas has not been converted yet. */
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

/**
 * The item's icon from the LC atlases (sprite sheet), or a glyph for its type: `size` px, or
 * `fluid` to fill its box (slots of any size).
 */
export function ItemIcon({ item, size, fluid }: { item: ItemDef; size?: number; fluid?: boolean }) {
  const sprite = itemIcon(item.id)
  const box = fluid ? undefined : size ? { width: size + 2, height: size + 2 } : undefined
  if (sprite && fluid) {
    // positions and sizes in % of the cell: the sheet scales with the box
    const free = (sheet: number) => Math.max(1, sheet - sprite.size)
    return (
      <span className="item-icon item-icon--fluid" aria-hidden="true">
        <span
          className="item-icon__sprite"
          style={{
            width: '100%',
            height: '100%',
            backgroundImage: `url(${sprite.url})`,
            backgroundPosition: `${(sprite.x / free(sprite.sheetWidth)) * 100}% ${(sprite.y / free(sprite.sheetHeight)) * 100}%`,
            backgroundSize: `${(sprite.sheetWidth / sprite.size) * 100}% ${(sprite.sheetHeight / sprite.size) * 100}%`,
          }}
        />
      </span>
    )
  }
  if (sprite) {
    const px = size ?? sprite.size
    const k = px / sprite.size
    return (
      <span className="item-icon" style={box} aria-hidden="true">
        <span
          className="item-icon__sprite"
          style={{
            width: px,
            height: px,
            backgroundImage: `url(${sprite.url})`,
            backgroundPosition: `-${sprite.x * k}px -${sprite.y * k}px`,
            backgroundSize: `${sprite.sheetWidth * k}px ${sprite.sheetHeight * k}px`,
          }}
        />
      </span>
    )
  }
  return (
    <span
      className={`item-icon item-icon--${item.type}${fluid ? ' item-icon--fluid' : ''}`}
      style={box}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        style={size ? { width: size * 0.75, height: size * 0.75 } : undefined}
      >
        <path d={GLYPHS[item.type]} />
      </svg>
    </span>
  )
}
