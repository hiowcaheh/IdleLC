import type { ItemDef } from '../../game/data/types.ts'
import { ItemIcon } from './ItemIcon.tsx'
import { TYPE_LABELS } from './itemTypes.ts'

export function ItemList({ items }: { items: { itemId: number; count: number; item: ItemDef }[] }) {
  return (
    <ul className="item-list">
      {items.map(({ itemId, count, item }) => (
        <li key={itemId} className={`item-row item-row--${item.type}`}>
          <ItemIcon item={item} />
          <span className="item-row__body">
            <span className="item-row__name">{item.name}</span>
            <span className="item-row__meta">
              {TYPE_LABELS[item.type]}
              {item.level > 1 && item.type !== 'material' ? ` · Lv ${item.level}` : ''}
            </span>
          </span>
          <span className="item-row__count">×{count.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  )
}
