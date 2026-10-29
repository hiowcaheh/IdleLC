import { lcData, lcIcons } from './lcSource.ts'
import type { ItemDef, ItemType } from './types.ts'

/** t_item.a_type_idx → item type (see docs/lc-database.md). */
const LC_TYPES: Record<number, ItemType> = {
  0: 'weapon',
  1: 'armor',
  2: 'scroll',
  4: 'material',
  5: 'accessory',
  6: 'potion',
}

const PLACEHOLDER_ITEMS: Record<number, ItemDef> = {
  1: { id: 1, name: 'Rusty Cog', type: 'material', level: 1, price: 4 },
  2: { id: 2, name: 'Golem Core', type: 'material', level: 1, price: 40 },
  3: { id: 3, name: 'Stone Shard', type: 'material', level: 3, price: 9 },
  4: { id: 4, name: 'Sentinel Blade', type: 'weapon', level: 3, price: 120 },
}

export const ITEMS: Record<number, ItemDef> = lcData
  ? Object.fromEntries(
      lcData.items.map((i) => [
        i.id,
        {
          id: i.id,
          name: i.name,
          type: LC_TYPES[i.type] ?? 'other',
          level: i.level,
          price: i.price,
        },
      ]),
    )
  : PLACEHOLDER_ITEMS

/**
 * % of an item's price the shop pays when the player sells it — t_shop.a_sell_rate (40 in the LC data;
 * the same value is used for the placeholder items).
 */
export const SHOP_SELL_RATE = lcData?.shop?.sellRate ?? 40

export function getItem(id: number): ItemDef {
  return ITEMS[id] ?? { id, name: `Item #${id}`, type: 'other', level: 0, price: 0 }
}

export interface ItemIconSprite {
  url: string
  /** Offset of the icon in the sheet, in pixels. */
  x: number
  y: number
  size: number
  sheetWidth: number
  sheetHeight: number
}

/** Where the item's icon sits in the icon sheet, or null when there is none (yet). */
export function itemIcon(id: number): ItemIconSprite | null {
  const index = lcIcons?.items[id]
  if (!lcIcons || index === undefined) return null
  const { size, columns } = lcIcons
  return {
    url: `${import.meta.env.BASE_URL}${lcIcons.file}`,
    x: (index % columns) * size,
    y: Math.floor(index / columns) * size,
    size,
    sheetWidth: lcIcons.width,
    sheetHeight: lcIcons.height,
  }
}
