import type { ItemDef } from '../../game/data/types.ts'
import { ItemIcon } from './ItemIcon.tsx'

const fmt = (n: number) => n.toLocaleString('en-US')

/**
 * A slot of the client's bag or equipment board: the item's icon filling it, with "+N" and the
 * stack count on the icon, framed in the colour of its name (rare grades, unidentified). Empty
 * without an item.
 */
export function ItemSlot({
  item,
  count = 1,
  plus = 0,
  tone = '',
  selected = false,
  label,
  onClick,
}: {
  item?: ItemDef
  count?: number
  plus?: number
  /** nameTone() of the piece (" name--grade-A"…). */
  tone?: string
  selected?: boolean
  /** What a screen reader says (name, count…). */
  label: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={`item-slot${tone}${selected ? ' is-selected' : ''}${item ? '' : ' is-empty'}`}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {item && (
        <span className="item-slot__icon">
          <ItemIcon item={item} fluid />
          {plus > 0 && <span className="item-slot__plus">+{plus}</span>}
          {count > 1 && <span className="item-slot__count">{fmt(count)}</span>}
        </span>
      )}
    </button>
  )
}
