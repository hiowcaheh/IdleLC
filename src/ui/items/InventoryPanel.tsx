import { useEffect, useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import type { ItemType } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import type { GearSource } from '../../game/logic/equipment.ts'
import type { ItemOption } from '../../game/logic/options.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { sellPrice, stacksValue } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { compareText, gearLine, pieceName, wearProblem } from '../gear/format.ts'
import { OptionList } from '../gear/OptionList.tsx'
import { potionText } from './potionText.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from './ItemIcon.tsx'
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

/**
 * The character's bag: drops and bought items stacked, upgraded pieces one by one. Gear can be worn
 * from here; items sell for their database price.
 */
export function InventoryPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const sellItems = useGameStore((s) => s.sellItems)
  const sellGear = useGameStore((s) => s.sellGear)
  const equipItem = useGameStore((s) => s.equipItem)
  const [selected, setSelected] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!confirmAll) return
    const timer = setTimeout(() => setConfirmAll(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmAll])

  if (!character) return null
  const inventory = character.inventory
  const away = character.expedition !== null
  const items: ListedItem[] = inventory
    .map((stack) => ({ ...stack, item: getItem(stack.itemId) }))
    .sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.item.type) - TYPE_ORDER.indexOf(b.item.type) ||
        a.item.name.localeCompare(b.item.name),
    )
  const total = inventory.reduce((sum, s) => sum + s.count, 0)
  // "sell all" keeps the gear the hero's class can wear
  const ownGear = (itemId: number) =>
    getItem(itemId).gear?.classes.includes(character.classId) ?? false
  const sellable = inventory.filter((s) => sellPrice(s.itemId) > 0 && !ownGear(s.itemId))
  const value = stacksValue(sellable)

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      setMessage(await action())
      setSelected(null)
    } catch (error) {
      setMessage(
        error instanceof GameError ? 'That is not possible right now.' : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
      setConfirmAll(false)
    }
  }

  const sell = (stacks: ItemStack[]) =>
    run(async () => {
      const sale = await sellItems(stacks)
      const what =
        sale.sold.length === 1
          ? `${fmt(sale.sold[0]!.count)}× ${getItem(sale.sold[0]!.itemId).name}`
          : `${fmt(sale.sold.reduce((n, s) => n + s.count, 0))} items`
      return `Sold ${what} for ${fmt(sale.gold)} gold.`
    })

  const wear = (source: GearSource, name: string) =>
    run(async () => {
      await equipItem(source)
      return `You are wearing ${name}.`
    })

  const onSellEverything = () => {
    if (!confirmAll) {
      setConfirmAll(true)
      return
    }
    void sell(sellable.map(({ itemId, count }) => ({ itemId, count })))
  }

  /** "Wear" button (or why not) for a piece of gear. */
  const wearActions = (
    itemId: number,
    plus: number,
    source: GearSource,
    options?: ItemOption[],
  ) => {
    const problem = wearProblem(character, itemId)
    return (
      <>
        <p className="item-row__note">
          {problem ?? `If you wear it: ${compareText(character, { itemId, plus, options })}`}
        </p>
        <button
          type="button"
          className="button button--gold"
          disabled={busy || away || problem !== null}
          onClick={() => wear(source, pieceName(itemId, plus))}
        >
          Wear
        </button>
      </>
    )
  }

  return (
    <Sheet title="Inventory" titleId="inventory-title" onClose={onClose}>
      <p className="inventory__status" role="status">
        {message ?? ''}
      </p>

      {character.gear.length > 0 && (
        <>
          <h3 className="inventory__heading">Accessories and upgraded gear</h3>
          <ul className="item-list">
            {character.gear.map((piece) => {
              const item = getItem(piece.itemId)
              const open = selected === piece.uid
              return (
                <li
                  key={piece.uid}
                  className={`item-row item-row--${item.type} item-row--button${open ? ' is-open' : ''}`}
                >
                  <button
                    type="button"
                    className="item-row__main"
                    aria-expanded={open}
                    onClick={() => setSelected(open ? null : piece.uid)}
                  >
                    <ItemIcon item={item} />
                    <span className="item-row__body">
                      <span className="item-row__name">{pieceName(piece.itemId, piece.plus)}</span>
                      {gearLine(piece.itemId, piece.plus) && (
                        <span className="item-row__meta">{gearLine(piece.itemId, piece.plus)}</span>
                      )}
                      <OptionList options={piece.options} classId={character.classId} />
                    </span>
                  </button>
                  {open && (
                    <div className="item-row__actions">
                      {wearActions(piece.itemId, piece.plus, { uid: piece.uid }, piece.options)}
                      {sellPrice(piece.itemId) > 0 && (
                        <button
                          type="button"
                          className="button"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await sellGear([piece.uid])
                              return `Sold ${pieceName(piece.itemId, piece.plus)} for ${fmt(sellPrice(piece.itemId))} gold.`
                            })
                          }
                        >
                          Sell · +{fmt(sellPrice(piece.itemId))}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <h3 className="inventory__heading">Bag</h3>
        </>
      )}

      {items.length === 0 ? (
        <p className="sheet__empty">Your bag is empty. Monsters drop items as you hunt.</p>
      ) : (
        <>
          <p className="sheet__meta">
            {items.length} kinds · {fmt(total)} items
          </p>
          <ul className="item-list">
            {items.map((entry) => {
              const key = `item-${entry.itemId}`
              const open = selected === key
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
                    onClick={() => setSelected(open ? null : key)}
                  >
                    <ItemRowContent {...entry} />
                  </button>
                  {open && (
                    <div className="item-row__actions">
                      {entry.item.gear && wearActions(entry.itemId, 0, { itemId: entry.itemId })}
                      {entry.item.potion && (
                        <p className="item-row__note">{potionText(entry.item.potion)}</p>
                      )}
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
                              className="button"
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
                ? `Sell the loot for ${fmt(value)} gold? Tap again`
                : `Sell all loot · +${fmt(value)} gold`}
            </button>
          )}
          {sellable.length > 0 && (
            <p className="sheet__meta inventory__keep-note">Gear your class can wear is kept.</p>
          )}
        </>
      )}
    </Sheet>
  )
}
