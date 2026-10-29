import type { ReactNode } from 'react'
import type { ItemDef } from '../../game/data/types.ts'
import { isRare } from '../../game/logic/rare.ts'
import { sellPrice } from '../../game/logic/shop.ts'
import { nameTone } from '../gear/format.ts'
import { ItemIcon } from './ItemIcon.tsx'
import { TYPE_LABELS } from './itemTypes.ts'

export interface ListedItem {
  itemId: number
  count: number
  item: ItemDef
}

const fmt = (n: number) => n.toLocaleString('en-US')

/** Icon, name, type / level / shop price and the stack count. */
export function ItemRowContent({ itemId, count, item }: ListedItem) {
  const price = sellPrice(itemId)
  return (
    <>
      <ItemIcon item={item} />
      <span className="item-row__body">
        <span className={`item-row__name${nameTone({ itemId })}`}>{item.name}</span>
        <span className="item-row__meta">
          {TYPE_LABELS[item.type]}
          {isRare(itemId) ? ' · Unidentified' : ''}
          {item.level > 1 && item.type !== 'material' ? ` · Lv ${item.level}` : ''}
          {price > 0 && (
            <>
              {' · '}
              <span className="coin coin--small" aria-hidden="true" /> {fmt(price)}
            </>
          )}
        </span>
      </span>
      <span className="item-row__count">×{fmt(count)}</span>
    </>
  )
}

export function ItemList({ items, footer }: { items: ListedItem[]; footer?: ReactNode }) {
  return (
    <ul className="item-list">
      {items.map((entry) => (
        <li key={entry.itemId} className={`item-row item-row--${entry.item.type}`}>
          <ItemRowContent {...entry} />
        </li>
      ))}
      {footer}
    </ul>
  )
}
