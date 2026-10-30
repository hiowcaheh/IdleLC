import { useState } from 'react'
import { EQUIP_SLOTS, HEAVEN_STONE_ID, getItem } from '../../game/data/items.ts'
import type { EquipSlot, GearSlot, ItemDef } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import { isRare } from '../../game/logic/rare.ts'
import { buyPrice, shopOffer } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { TYPE_LABELS } from '../items/itemTypes.ts'
import { potionLine, potionText } from '../items/potionText.ts'
import { Sheet } from '../Sheet.tsx'
import {
  SLOT_LABELS,
  compareText,
  fmt,
  gearLine,
  nameTone,
  optionLines,
  wearProblem,
} from './format.ts'

/** The display slot of a shop slot (the accessory places share one label). */
const slotKey = (slot: GearSlot): EquipSlot => (slot === 'accessory' ? 'accessory1' : slot)

/**
 * The shop: weapons and armor of the hero's class around its level (previous, current and next
 * tier), accessories with random options, and the zone merchants' goods (potions, stones).
 */
export function ShopPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const buyItem = useGameStore((s) => s.buyItem)
  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  if (!character) return null

  const offer = shopOffer(character)
  const away = character.expedition !== null
  const gear = [...offer.gear].sort(
    (a, b) => EQUIP_SLOTS.indexOf(slotKey(a.slot)) - EQUIP_SLOTS.indexOf(slotKey(b.slot)),
  )
  // potions first, then stones and glasses (stable: the merchants' order within each)
  const goods = [...offer.goods].sort(
    (a, b) => Number(!getItem(a).potion) - Number(!getItem(b).potion),
  )

  const buy = async (itemId: number, count: number) => {
    if (busy) return
    setBusy(true)
    try {
      const { pieces } = await buyItem(itemId, count)
      const name = getItem(itemId).name
      const options = pieces.map((p) =>
        optionLines(p.options, character.classId)
          .map((o) => o.text)
          .join(', '),
      )
      toast(
        pieces.length === 0
          ? `Bought ${count > 1 ? `${count}× ` : ''}${name}.`
          : `Bought ${name}: ${options.join(' / ')}.`,
      )
    } catch (error) {
      toast(
        error instanceof GameError && error.code === 'not-enough-gold'
          ? 'Not enough gold.'
          : 'That is not possible right now.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const row = (item: ItemDef, tier?: number) => {
    const price = buyPrice(item.id)
    const open = selected === item.id
    const accessory = item.gear?.slot === 'accessory'
    const problem = item.gear && !accessory ? wearProblem(character, item.id) : null
    const afford = character.gold >= price
    return (
      <li
        key={item.id}
        className={`item-row item-row--${item.type} item-row--button${open ? ' is-open' : ''}`}
      >
        <button
          type="button"
          className="item-row__main"
          aria-expanded={open}
          onClick={() => setSelected(open ? null : item.id)}
        >
          <ItemIcon item={item} />
          <span className="item-row__body">
            <span className={`item-row__name${nameTone({ itemId: item.id })}`}>{item.name}</span>
            <span className="item-row__meta">
              {accessory
                ? 'Accessory · random options'
                : item.gear
                  ? gearLine(item.id)
                  : item.potion
                    ? potionLine(item.potion)
                    : TYPE_LABELS[item.type]}
              {!item.gear && item.level > 1 && (
                <span className={character.level < item.level ? 'shop__locked' : ''}>
                  {' '}
                  · Lv {item.level}
                </span>
              )}
              {tier !== undefined && (
                <span className={problem ? 'shop__locked' : ''}> · Lv {tier}</span>
              )}
            </span>
          </span>
          <span className={`shop__price${afford ? '' : ' is-short'}`}>
            <span className="coin coin--small" aria-hidden="true" /> {fmt(price)}
          </span>
        </button>
        {open && (
          <div className="item-row__actions">
            {item.gear && !accessory && (
              <p className="item-row__note">
                {problem ??
                  `If you wear it: ${compareText(character, { itemId: item.id, plus: 0 })}`}
              </p>
            )}
            {accessory && (
              <p className="item-row__note">
                Comes with 1–5 random options from its option list. Up to three accessories can be
                worn.
              </p>
            )}
            {item.potion && <p className="item-row__note">{potionText(item.potion)}</p>}
            {item.magnifier && (
              <p className="item-row__note">
                Identifies one rare item at the Appraiser
                {item.magnifier.chance < 1
                  ? ` — works ${Math.round(item.magnifier.chance * 100)}% of the time.`
                  : ' — always works.'}
              </p>
            )}
            {isRare(item.id) && (
              <p className="item-row__note">
                Rare item: sold unidentified. The Appraiser reveals its rare options with a
                magnifying glass.
              </p>
            )}
            {item.id === HEAVEN_STONE_ID && (
              <p className="item-row__note">
                Upgrades a worn weapon or armor piece by +1 (Character window). 10 Smelting Stones
                from monsters can be exchanged for one in the Inventory.
              </p>
            )}
            <button
              type="button"
              className="button button--gold"
              disabled={busy || away || !afford}
              onClick={() => buy(item.id, 1)}
            >
              Buy · {fmt(price)}
            </button>
            {!item.gear && (
              <button
                type="button"
                className="button"
                disabled={busy || away || character.gold < price * 10}
                onClick={() => buy(item.id, 10)}
              >
                Buy 10 · {fmt(price * 10)}
              </button>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <Sheet
      title="Shop"
      titleId="shop-title"
      onClose={onClose}
      extra={
        <p className="shop__gold" aria-label={`${fmt(character.gold)} gold`}>
          <span className="coin" aria-hidden="true" /> {fmt(character.gold)}
        </p>
      }
    >
      <h3 className="inventory__heading">Weapons and armor</h3>
      <p className="sheet__meta">
        For your level: the tier you are in, the one before and the next one.
      </p>
      {gear.map(({ slot, tiers }) => (
        <section key={slot} className="shop__slot">
          <h4 className="shop__slot-title">{SLOT_LABELS[slotKey(slot)]}</h4>
          <ul className="item-list">
            {tiers.flatMap((t) => t.items.map((id) => row(getItem(id), t.level)))}
          </ul>
        </section>
      ))}

      <h3 className="inventory__heading">Accessories</h3>
      <ul className="item-list">{offer.accessories.map((id) => row(getItem(id)))}</ul>

      {goods.length > 0 && (
        <>
          <h3 className="inventory__heading">Goods</h3>
          <ul className="item-list">{goods.map((id) => row(getItem(id)))}</ul>
        </>
      )}
      {away && <p className="sheet__meta">The shop is closed while you are on an expedition.</p>}
    </Sheet>
  )
}
