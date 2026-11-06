import { effectiveStats } from '../../game/logic/combat.ts'
import { combatSession } from '../../game/session/combatSession.ts'
import { dungeonSession } from '../../game/session/dungeonSession.ts'
import { statChanges, withStatChanges } from '../statChanges.tsx'
import { Gold } from '../Gold.tsx'
import { useState } from 'react'
import {
  GOLDEN_MAGNIFIER_ID,
  HEAVEN_STONE_ID,
  MAGNIFIER_ID,
  SMELTING_STONE_ID,
  getItem,
} from '../../game/data/items.ts'
import type { ItemDef, ItemType } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import {
  STONES_PER_HEAVEN,
  checkWear,
  type GearPiece,
  type GearSource,
} from '../../game/logic/equipment.ts'
import type { ItemOption } from '../../game/logic/options.ts'
import { isRare, type IdentifyTarget } from '../../game/logic/rare.ts'
import type { DrinkProblem } from '../../game/logic/combat.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { sellPrice, stacksValue } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { STAT_TOAST_MS, toast } from '../../state/toasts.ts'
import { heroStats, nameTone, pieceName, rareLabel, wearProblem } from '../gear/format.ts'
import { PotionNotes } from './PotionNotes.tsx'
import { potionLine } from './potionText.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from './ItemIcon.tsx'
import { WearCompare } from '../gear/WearCompare.tsx'
import { ItemInfo } from './ItemInfo.tsx'
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

/** By type; weapons and armor from the highest required level down. */
const byType = (a: ItemDef, b: ItemDef) =>
  TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
  (a.gear && b.gear ? b.level - a.level : 0) ||
  a.name.localeCompare(b.name)

/** What the bag says when the hero can't drink a potion now. */
const DRINK_PROBLEMS: Record<DrinkProblem | 'away', string> = {
  away: 'Your hero is on an expedition.',
  dead: 'Your hero is down. Wait for the revival.',
  'level-too-low': 'Your level is too low for this potion.',
  'none-left': 'None left.',
  cooldown: 'A potion of this kind is cooling down.',
  working: 'A potion of this kind is still working.',
}

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
  const redeemTitleItem = useGameStore((s) => s.redeemTitleItem)
  const identifyItems = useGameStore((s) => s.identifyItems)
  const [selected, setSelected] = useState<string | null>(null)
  const [category, setCategory] = useState<Category>('all')
  const [confirmAll, setConfirmAll] = useState(false)
  const drinkPotion = useGameStore((s) => s.drinkPotion)
  const [busy, setBusy] = useState(false)

  if (!character) return null
  const inventory = character.inventory
  const away = character.expedition !== null
  const dungeonLocked = !!character.dungeons?.active
  const entries: BagEntry[] = [
    ...character.gear.map((piece): BagEntry => ({
      key: `piece-${piece.uid}`,
      item: getItem(piece.itemId),
      piece,
    })),
    // weapons and armor never stack: one slot per piece, like in the client
    ...inventory.flatMap((stack): BagEntry[] => {
      const item = getItem(stack.itemId)
      return item.gear
        ? Array.from({ length: stack.count }, (_, i) => ({
            key: `item-${stack.itemId}-${i}`,
            item,
            stack,
          }))
        : [{ key: `item-${stack.itemId}`, item, stack }]
    }),
  ].sort((a, b) => byType(a.item, b.item) || (b.piece?.plus ?? 0) - (a.piece?.plus ?? 0))
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
  // "sell all" sells the loot of the tab open
  const sellable = inventory.filter(
    (s) =>
      sellPrice(s.itemId) > 0 &&
      !keep(s.itemId) &&
      (category === 'all' || categoryOf(getItem(s.itemId)) === category),
  )
  const tabName = CATEGORIES.find((c) => c.id === category)?.label.toLowerCase() ?? ''
  const sellAllLabel =
    category === 'all'
      ? 'Sell all loot'
      : `Sell all ${category === 'other' ? 'other items' : tabName}`
  const value = stacksValue(sellable)

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      // wearing, taking off or upgrading: what it changed in the hero's stats, under the message
      const before = heroStats(character)
      const message = await action()
      const after = useGameStore.getState().character
      const changes = after ? statChanges(before, heroStats(after)) : []
      toast(withStatChanges(message, changes), 'info', changes.length ? STAT_TOAST_MS : undefined)
    } catch (error) {
      toast(
        error instanceof GameError
          ? error.code === 'title-owned'
            ? 'You already have this title for good.'
            : 'That is not possible right now.'
          : 'Something went wrong.',
        'error',
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

  const sellEverything = () => sell(sellable.map(({ itemId, count }) => ({ itemId, count })))

  /** "Wear" button (or why not) for a piece of gear. */
  const wearActions = (
    itemId: number,
    plus: number,
    source: GearSource,
    options?: ItemOption[],
    rare?: number,
  ) => {
    // gear of another class: nothing to wear (its class shows in the item's card)
    if (checkWear(character, itemId, options) === 'wrong-class') return null
    const problem = wearProblem(character, itemId, options)
    return (
      <>
        {problem ? (
          <p className="item-row__note">{problem}</p>
        ) : (
          <WearCompare
            character={character}
            piece={{ itemId, plus, options, rare }}
            note={
              isRare(itemId) && rare === undefined
                ? 'Unidentified: its options appear when the Appraiser identifies it.'
                : undefined
            }
          />
        )}
        <button
          type="button"
          className="button button--gold button--wide"
          disabled={busy || away || dungeonLocked || problem !== null}
          onClick={() => wear(source, pieceName(itemId, plus, rare))}
        >
          Wear
        </button>
      </>
    )
  }

  const owned = (itemId: number) =>
    inventory.reduce((n, s) => n + (s.itemId === itemId ? s.count : 0), 0)

  /** Identify buttons (one per kind of magnifying glass) for an unidentified rare piece. */
  const identifyActions = (target: IdentifyTarget) => (
    <>
      {[MAGNIFIER_ID, GOLDEN_MAGNIFIER_ID].map((glassId) => {
        const glass = getItem(glassId)
        const have = owned(glassId)
        const chance = Math.round((glass.magnifier?.chance ?? 1) * 100)
        return (
          <button
            key={glassId}
            type="button"
            className={`button identify-button${glassId === GOLDEN_MAGNIFIER_ID ? ' button--gold' : ''}`}
            disabled={busy || away || dungeonLocked || have < 1}
            onClick={() =>
              run(async () => {
                const result = await identifyItems(glassId, [target])
                const [done] = result.results
                if (!done?.success) return `The ${glass.name.toLowerCase()} failed. Try again.`
                // the piece leaves its stack: show it in its new slot
                setSelected(`piece-${done.piece.uid}`)
                return `${rareLabel(done.piece)}: ${pieceName(done.piece.itemId, 0, done.piece.rare)}.`
              })
            }
          >
            <span className="identify-button__glass">
              <ItemIcon item={glass} size={30} />
              <span className="identify-button__count">{fmt(have)}</span>
            </span>
            <span className="identify-button__text">
              <span className="identify-button__title">Identify</span>
              <span className="identify-button__meta">
                {chance < 100 ? `${chance}% chance` : 'Always works'}
              </span>
            </span>
          </button>
        )
      })}
      <p className="item-row__note">
        Or let the Appraiser identify all your rare items at once (hunting panel).
      </p>
    </>
  )

  /** What can be done with the piece or stack in the slot tapped. */
  const details = (entry: BagEntry) => {
    const { item, piece, stack } = entry
    if (piece) {
      return (
        <>
          <ItemInfo
            character={character}
            itemId={piece.itemId}
            plus={piece.plus}
            options={piece.options}
            rare={piece.rare}
          />
          <div className="item-row__actions">
            {isRare(piece.itemId) &&
              piece.rare === undefined &&
              identifyActions({ uid: piece.uid })}
            {wearActions(piece.itemId, piece.plus, { uid: piece.uid }, piece.options, piece.rare)}
            {sellPrice(piece.itemId) > 0 && (
              <button
                type="button"
                className="button button--cost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await sellGear([piece.uid])
                    return `Sold ${pieceName(piece.itemId, piece.plus, piece.rare)} for ${fmt(sellPrice(piece.itemId))} gold.`
                  })
                }
              >
                <span>Sell</span>
                <Gold amount={sellPrice(piece.itemId)} prefix="+" />
              </button>
            )}
          </div>
        </>
      )
    }
    const price = sellPrice(stack.itemId)
    return (
      <>
        <ItemInfo character={character} itemId={stack.itemId} count={stack.count} />
        <div className="item-row__actions">
          {isRare(stack.itemId) && identifyActions({ itemId: stack.itemId, count: 1 })}
          {item.gear && wearActions(stack.itemId, 0, { itemId: stack.itemId })}
          {item.potion && (
            <>
              <PotionNotes potion={item.potion} />
              <button
                type="button"
                className="button button--gold"
                disabled={busy || away}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const before = effectiveStats(
                      (dungeonSession.combat() ?? combatSession.state).player,
                    )
                    const problem = await drinkPotion(stack.itemId)
                    if (problem) {
                      toast(DRINK_PROBLEMS[problem], 'error')
                      return
                    }
                    // a boost changes stats; healing and mana potions restore over time
                    const changes =
                      item.potion!.kind === 'boost'
                        ? statChanges(
                            before,
                            effectiveStats((dungeonSession.combat() ?? combatSession.state).player),
                          )
                        : [{ label: '', text: potionLine(item.potion!), good: true }]
                    toast(
                      withStatChanges(`You drink ${item.name}.`, changes),
                      'info',
                      STAT_TOAST_MS,
                    )
                  } catch (error) {
                    toast(error instanceof Error ? error.message : 'Potion unavailable.', 'error')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Drink
              </button>
            </>
          )}
          {item.title !== undefined && (
            <button
              type="button"
              className="button button--gold"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const use = await redeemTitleItem(stack.itemId)
                  return use.extended
                    ? `${use.title.name}: its time is extended.`
                    : `New title: ${use.title.name}. See it in the Titles window.`
                })
              }
            >
              Use
            </button>
          )}
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
                className="button button--cost"
                disabled={busy}
                onClick={() => sell([{ itemId: stack.itemId, count: 1 }])}
              >
                <span>Sell 1</span>
                <Gold amount={price} prefix="+" />
              </button>
              {stack.count > 1 && (
                <button
                  type="button"
                  className="button button--cost"
                  disabled={busy}
                  onClick={() => sell([{ itemId: stack.itemId, count: stack.count }])}
                >
                  <span>Sell all ×{fmt(stack.count)}</span>
                  <Gold amount={price * stack.count} prefix="+" />
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
      className="sheet--fixed sheet--client sheet--inventory"
      titleId="inventory-title"
      onClose={onClose}
      extra={
        <p className="shop__gold" aria-label={`${fmt(character.gold)} gold`}>
          <Gold amount={character.gold} />
        </p>
      }
    >
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
      {shown.length > 0 ? (
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
                  onClick={() => setSelected(key === selected ? null : key)}
                />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="bag-empty">
          {category === 'all' ? 'Your bag is empty.' : 'No items of this type.'}
        </p>
      )}
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
          <div className="item-details">{details(chosen)}</div>
        </Sheet>
      )}
      {sellable.length > 0 && (
        <>
          <button
            type="button"
            className="button button--wide button--cost inventory__sell-all"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
          >
            <span>{sellAllLabel}</span>
            <Gold amount={value} prefix="+" />
          </button>
          <p className="sheet__meta inventory__keep-note">
            Kept: gear your class can wear, potions, upgrade stones and magnifying glasses.
          </p>
        </>
      )}
      {confirmAll && (
        <Sheet
          centered
          title={sellAllLabel}
          titleId="sell-all-title"
          onClose={() => setConfirmAll(false)}
        >
          <p className="confirm__text">
            Sell {fmt(sellable.reduce((n, s) => n + s.count, 0))} items for <Gold amount={value} />?
          </p>
          <div className="item-row__actions">
            <button
              type="button"
              className="button button--gold"
              disabled={busy}
              onClick={() => void sellEverything()}
            >
              Sell
            </button>
            <button type="button" className="button" onClick={() => setConfirmAll(false)}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  )
}
