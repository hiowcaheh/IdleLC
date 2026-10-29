import { useEffect, useRef, useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import type { ItemType } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { sellPrice, stacksValue } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemRowContent, type ListedItem } from './ItemList.tsx'

const TYPE_ORDER: ItemType[] = [
  'weapon',
  'armor',
  'accessory',
  'scroll',
  'potion',
  'material',
  'other',
]

const fmt = (n: number) => n.toLocaleString('en-US')

/** The character's bag: every item that dropped, stacked; items sell for their database price. */
export function InventoryPanel({ onClose }: { onClose(): void }) {
  const inventory = useGameStore((s) => s.character?.inventory ?? [])
  const sellItems = useGameStore((s) => s.sellItems)
  const dialog = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialog.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!confirmAll) return
    const timer = setTimeout(() => setConfirmAll(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmAll])

  const items: ListedItem[] = inventory
    .map((stack) => ({ ...stack, item: getItem(stack.itemId) }))
    .sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.item.type) - TYPE_ORDER.indexOf(b.item.type) ||
        a.item.name.localeCompare(b.item.name),
    )
  const total = inventory.reduce((sum, s) => sum + s.count, 0)
  const value = stacksValue(inventory)
  const sellable = inventory.filter((s) => sellPrice(s.itemId) > 0)

  const sell = async (stacks: ItemStack[]) => {
    if (busy || stacks.length === 0) return
    setBusy(true)
    try {
      const sale = await sellItems(stacks)
      const what =
        sale.sold.length === 1
          ? `${fmt(sale.sold[0]!.count)}× ${getItem(sale.sold[0]!.itemId).name}`
          : `${fmt(sale.sold.reduce((n, s) => n + s.count, 0))} items`
      setMessage(`Sold ${what} for ${fmt(sale.gold)} gold.`)
      setSelected(null)
    } catch (error) {
      setMessage(
        error instanceof GameError ? 'That sale is not possible.' : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
      setConfirmAll(false)
    }
  }

  const onSellEverything = () => {
    if (!confirmAll) {
      setConfirmAll(true)
      return
    }
    void sell(sellable.map(({ itemId, count }) => ({ itemId, count })))
  }

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

        <p className="inventory__status" role="status">
          {message ?? ''}
        </p>

        {items.length === 0 ? (
          <p className="sheet__empty">Your bag is empty. Monsters drop items as you hunt.</p>
        ) : (
          <>
            <p className="sheet__meta">
              {items.length} kinds · {fmt(total)} items · worth{' '}
              <span className="coin coin--small" aria-hidden="true" /> {fmt(value)} gold
            </p>
            <ul className="item-list">
              {items.map((entry) => {
                const open = selected === entry.itemId
                const price = sellPrice(entry.itemId)
                return (
                  <li
                    key={entry.itemId}
                    className={`item-row item-row--${entry.item.type} item-row--button${open ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      className="item-row__main"
                      aria-expanded={open}
                      onClick={() => setSelected(open ? null : entry.itemId)}
                    >
                      <ItemRowContent {...entry} />
                    </button>
                    {open && (
                      <div className="item-row__actions">
                        {price > 0 ? (
                          <>
                            <button
                              type="button"
                              className="button"
                              disabled={busy}
                              onClick={() => sell([{ itemId: entry.itemId, count: 1 }])}
                            >
                              Sell 1 · +{fmt(price)}
                            </button>
                            {entry.count > 1 && (
                              <button
                                type="button"
                                className="button button--gold"
                                disabled={busy}
                                onClick={() => sell([{ itemId: entry.itemId, count: entry.count }])}
                              >
                                Sell all ×{fmt(entry.count)} · +{fmt(price * entry.count)}
                              </button>
                            )}
                          </>
                        ) : (
                          <p className="item-row__note">The shop does not buy this item.</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {sellable.length > 0 && (
              <button
                type="button"
                className={`button button--wide inventory__sell-all${confirmAll ? ' is-armed' : ''}`}
                disabled={busy}
                onClick={onSellEverything}
              >
                {confirmAll
                  ? `Sell all items for ${fmt(value)} gold? Tap again`
                  : `Sell everything · +${fmt(value)} gold`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
