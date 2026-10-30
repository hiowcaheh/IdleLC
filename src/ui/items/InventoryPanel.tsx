import { useEffect, useState } from 'react'
import { HEAVEN_STONE_ID, SMELTING_STONE_ID, getItem } from '../../game/data/items.ts'
import type { ItemDef, ItemType } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import { STONES_PER_HEAVEN, type GearPiece, type GearSource } from '../../game/logic/equipment.ts'
import type { ItemOption } from '../../game/logic/options.ts'
import { isRare } from '../../game/logic/rare.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { sellPrice, stacksValue } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import {
  compareText,
  gearLine,
  nameTone,
  pieceName,
  rareLabel,
  wearProblem,
} from '../gear/format.ts'
import { OptionList } from '../gear/OptionList.tsx'
import { potionText } from './potionText.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from './ItemIcon.tsx'
import { ItemRowContent } from './ItemList.tsx'
import { ItemSlot } from './ItemSlot.tsx'

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

/** What a bag slot holds: a single piece (upgraded, with options…) or a stack. */
type BagEntry =
  | { key: string; item: ItemDef; piece: GearPiece; stack?: undefined }
  | { key: string; item: ItemDef; stack: ItemStack; piece?: undefined }

type Category = 'all' | 'weapon' | 'armor' | 'accessory' | 'potion' | 'other'

/** The bag's tabs, by item type. */
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'accessory', label: 'Jewelry' },
  { id: 'potion', label: 'Potions' },
  { id: 'other', label: 'Other' },
]

const categoryOf = (item: ItemDef): Category =>
  item.type === 'weapon' ||
  item.type === 'armor' ||
  item.type === 'accessory' ||
  item.type === 'potion'
    ? item.type
    : 'other'

const byType = (a: ItemDef, b: ItemDef) =>
  TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name)

/**
 * The character's bag like the client's: a grid of slots (single pieces first, then stacks); the
 * item tapped shows below with what can be done with it — wear, sell, exchange stones.
 */
export function InventoryPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const sellItems = useGameStore((s) => s.sellItems)
  const sellGear = useGameStore((s) => s.sellGear)
  const equipItem = useGameStore((s) => s.equipItem)
  const exchangeStones = useGameStore((s) => s.exchangeStones)
  const [selected, setSelected] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('all')
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
  const entries: BagEntry[] = [
    ...character.gear
      .map((piece) => ({ key: `piece-${piece.uid}`, item: getItem(piece.itemId), piece }))
      .sort((a, b) => byType(a.item, b.item) || b.piece.plus - a.piece.plus),
    // weapons and armor never stack: one slot per piece, like in the client
    ...inventory
      .map((stack) => ({ item: getItem(stack.itemId), stack }))
      .sort((a, b) => byType(a.item, b.item))
      .flatMap(({ item, stack }) =>
        item.gear
          ? Array.from({ length: stack.count }, (_, i) => ({
              key: `item-${stack.itemId}-${i}`,
              item,
              stack,
            }))
          : [{ key: `item-${stack.itemId}`, item, stack }],
      ),
  ]
  const shown = entries.filter((e) => category === 'all' || categoryOf(e.item) === category)
  const chosen = entries.find((e) => e.key === selected)
  const total = inventory.reduce((sum, s) => sum + s.count, 0) + character.gear.length
  // "sell all" keeps what the hero uses: its class's gear, potions, upgrade stones and glasses
  const keep = (itemId: number) => {
    const item = getItem(itemId)
    return (
      (item.gear?.classes.includes(character.classId) ?? false) ||
      item.potion !== undefined ||
      item.magnifier !== undefined ||
      itemId === SMELTING_STONE_ID ||
      itemId === HEAVEN_STONE_ID
    )
  }
  const sellable = inventory.filter((s) => sellPrice(s.itemId) > 0 && !keep(s.itemId))
  const value = stacksValue(sellable)

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      setMessage(await action())
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
    rare?: number,
  ) => {
    const problem = wearProblem(character, itemId, options)
    return (
      <>
        <p className="item-row__note">
          {problem ?? `If you wear it: ${compareText(character, { itemId, plus, options, rare })}`}
          {!problem && isRare(itemId) && rare === undefined
            ? ' — unidentified: its options appear when the Appraiser identifies it.'
            : ''}
        </p>
        <button
          type="button"
          className="button button--gold"
          disabled={busy || away || problem !== null}
          onClick={() => wear(source, pieceName(itemId, plus, rare))}
        >
          Wear
        </button>
      </>
    )
  }

  /** What can be done with the piece or stack in the slot tapped. */
  const details = (entry: BagEntry) => {
    const { item, piece, stack } = entry
    if (piece) {
      return (
        <>
          <div className="bag-details__head">
            <ItemIcon item={item} />
            <span className="item-row__body">
              <span className={`item-row__name${nameTone(piece)}`}>
                {pieceName(piece.itemId, piece.plus, piece.rare)}
              </span>
              <span className="item-row__meta">
                {[rareLabel(piece), gearLine(piece.itemId, piece.plus, piece.rare)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <OptionList options={piece.options} classId={character.classId} />
            </span>
          </div>
          <div className="item-row__actions">
            {wearActions(piece.itemId, piece.plus, { uid: piece.uid }, piece.options, piece.rare)}
            {sellPrice(piece.itemId) > 0 && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await sellGear([piece.uid])
                    return `Sold ${pieceName(piece.itemId, piece.plus, piece.rare)} for ${fmt(sellPrice(piece.itemId))} gold.`
                  })
                }
              >
                Sell · +{fmt(sellPrice(piece.itemId))}
              </button>
            )}
          </div>
        </>
      )
    }
    const price = sellPrice(stack.itemId)
    return (
      <>
        <div className="bag-details__head">
          <ItemRowContent itemId={stack.itemId} count={stack.count} item={item} />
        </div>
        <div className="item-row__actions">
          {item.gear && wearActions(stack.itemId, 0, { itemId: stack.itemId })}
          {item.potion && <p className="item-row__note">{potionText(item.potion)}</p>}
          {stack.itemId === SMELTING_STONE_ID && (
            <>
              <p className="item-row__note">
                Only Heaven Stones upgrade gear: {STONES_PER_HEAVEN} Smelting Stones make one.
              </p>
              <button
                type="button"
                className="button button--gold"
                disabled={busy || away || stack.count < STONES_PER_HEAVEN}
                onClick={() =>
                  run(async () => {
                    const count = Math.floor(stack.count / STONES_PER_HEAVEN)
                    await exchangeStones(count)
                    return `Exchanged ${fmt(count * STONES_PER_HEAVEN)} Smelting Stones for ${fmt(count)} Heaven ${count === 1 ? 'Stone' : 'Stones'}.`
                  })
                }
              >
                Exchange for {fmt(Math.floor(stack.count / STONES_PER_HEAVEN))} Heaven Stone
                {Math.floor(stack.count / STONES_PER_HEAVEN) === 1 ? '' : 's'}
              </button>
            </>
          )}
          {price > 0 ? (
            <>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => sell([{ itemId: stack.itemId, count: 1 }])}
              >
                Sell 1 · +{fmt(price)}
              </button>
              {stack.count > 1 && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => sell([{ itemId: stack.itemId, count: stack.count }])}
                >
                  Sell all ×{fmt(stack.count)} · +{fmt(price * stack.count)}
                </button>
              )}
            </>
          ) : (
            <p className="item-row__note">The shop does not buy this item.</p>
          )}
        </div>
      </>
    )
  }

  return (
    <Sheet
      title="Inventory"
      titleId="inventory-title"
      onClose={onClose}
      extra={
        <p className="shop__gold" aria-label={`${fmt(character.gold)} gold`}>
          <span className="coin" aria-hidden="true" /> {fmt(character.gold)}
        </p>
      }
    >
      <p className="inventory__status" role="status">
        {message ?? ''}
      </p>

      {entries.length === 0 ? (
        <p className="sheet__empty">Your bag is empty. Monsters drop items as you hunt.</p>
      ) : (
        <>
          <div className="tabs tabs--small" role="tablist" aria-label="Item types">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={`tabs__tab${category === c.id ? ' is-active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <ul className="bag-grid" aria-label="Bag">
            {shown.map((entry) => {
              const { key, item, piece, stack } = entry
              const name = piece ? pieceName(piece.itemId, piece.plus, piece.rare) : item.name
              const count = stack && !item.gear ? stack.count : 1
              return (
                <li key={key}>
                  <ItemSlot
                    item={item}
                    count={count}
                    plus={piece?.plus}
                    tone={nameTone(piece ?? { itemId: item.id })}
                    selected={key === selected}

                    label={count > 1 ? `${name} ×${fmt(count)}` : name}
                    onClick={() => {
                      setSelected(key === selected ? null : key)
                      setMessage(null)
                    }}
                  />
                </li>
              )
            })}
          </ul>
          {shown.length === 0 && <p className="sheet__empty">Nothing of this kind in your bag.</p>}
          <p className="sheet__meta">
            {entries.length} slots · {fmt(total)} items · tap an item to see it
          </p>
          {chosen && (
            <Sheet
              centered
              title={
                chosen.piece
                  ? pieceName(chosen.piece.itemId, chosen.piece.plus, chosen.piece.rare)
                  : chosen.item.name
              }
              titleId="bag-item-title"
              onClose={() => setSelected(null)}
            >
              {message && (
                <p className="inventory__status" role="status">
                  {message}
                </p>
              )}
              <div className="item-details">{details(chosen)}</div>
            </Sheet>
          )}
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
            <p className="sheet__meta inventory__keep-note">
              Kept: gear your class can wear, potions, upgrade stones and magnifying glasses.
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
