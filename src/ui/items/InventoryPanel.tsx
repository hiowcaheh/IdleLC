import { useEffect, useRef } from 'react'
import { getItem } from '../../game/data/items.ts'
import type { ItemType } from '../../game/data/types.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemList } from './ItemList.tsx'

const TYPE_ORDER: ItemType[] = [
  'weapon',
  'armor',
  'accessory',
  'scroll',
  'potion',
  'material',
  'other',
]

/** The character's bag: every item that dropped, stacked. */
export function InventoryPanel({ onClose }: { onClose(): void }) {
  const inventory = useGameStore((s) => s.character?.inventory ?? [])
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialog.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const items = inventory
    .map((stack) => ({ ...stack, item: getItem(stack.itemId) }))
    .sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.item.type) - TYPE_ORDER.indexOf(b.item.type) ||
        a.item.name.localeCompare(b.item.name),
    )
  const total = inventory.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet__header">
          <h2 id="inventory-title" className="sheet__title">
            Inventory
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" />
            </svg>
          </button>
        </header>
        {items.length === 0 ? (
          <p className="sheet__empty">Your bag is empty. Monsters drop items as you hunt.</p>
        ) : (
          <>
            <p className="sheet__meta">
              {items.length} kinds · {total.toLocaleString('en-US')} items
            </p>
            <ItemList items={items} />
          </>
        )}
      </div>
    </div>
  )
}
