import { useMemo, useState } from 'react'
import { UPGRADE_STONE_IDS, getItem, shopItems } from '../../game/data/items.ts'
import { ZONES } from '../../game/data/zones.ts'
import { GameError } from '../../game/logic/character.ts'
import { buyPrice } from '../../game/logic/equipment.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { TYPE_LABELS } from '../items/itemTypes.ts'
import { Sheet } from '../Sheet.tsx'
import { compareText, fmt, gearLine, wearProblem } from './format.ts'

/** The NPC shops of the zone the hero hunts in (1:1 t_shopitem): gear and Smelting Stones. */
export function ShopPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const buyItem = useGameStore((s) => s.buyItem)
  const [onlyMine, setOnlyMine] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const zoneId = character?.location.zoneId ?? ''
  const classId = character?.classId

  const items = useMemo(() => {
    const all = shopItems(zoneId).map(getItem)
    const goods = all.filter((i) => !i.gear)
    const gear = all
      .filter((i) => i.gear && (!onlyMine || (classId && i.gear.classes.includes(classId))))
      .sort((a, b) => a.level - b.level || a.price - b.price)
    return [...goods, ...gear]
  }, [zoneId, classId, onlyMine])

  if (!character) return null
  const away = character.expedition !== null

  const buy = async (itemId: number, count: number) => {
    if (busy) return
    setBusy(true)
    try {
      await buyItem(itemId, count)
      setMessage(`Bought ${count > 1 ? `${count}× ` : ''}${getItem(itemId).name}.`)
    } catch (error) {
      setMessage(
        error instanceof GameError && error.code === 'not-enough-gold'
          ? 'Not enough gold.'
          : 'That is not possible right now.',
      )
    } finally {
      setBusy(false)
    }
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
      <p className="sheet__meta">
        Merchants of {ZONES[zoneId]?.name ?? 'this zone'}. Gear goes to your bag — wear it from
        there.
      </p>
      <label className="shop__filter">
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
        Only gear for my class
      </label>
      <p className="inventory__status" role="status">
        {message ?? ''}
      </p>
      {items.length === 0 ? (
        <p className="sheet__empty">Nobody sells anything here. Try another zone.</p>
      ) : (
        <ul className="item-list">
          {items.map((item) => {
            const price = buyPrice(item.id)
            const open = selected === item.id
            const problem = item.gear ? wearProblem(character, item.id) : null
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
                    <span className="item-row__name">{item.name}</span>
                    <span className="item-row__meta">
                      {item.gear ? gearLine(item.id) : TYPE_LABELS[item.type]}
                      {item.gear && (
                        <span className={problem ? 'shop__locked' : ''}> · Lv {item.level}</span>
                      )}
                    </span>
                  </span>
                  <span className={`shop__price${afford ? '' : ' is-short'}`}>
                    <span className="coin coin--small" aria-hidden="true" /> {fmt(price)}
                  </span>
                </button>
                {open && (
                  <div className="item-row__actions">
                    {item.gear && (
                      <p className="item-row__note">
                        {problem ??
                          `If you wear it: ${compareText(character, { itemId: item.id, plus: 0 })}`}
                      </p>
                    )}
                    {UPGRADE_STONE_IDS.includes(item.id) && (
                      <p className="item-row__note">
                        Upgrades a worn weapon or armor piece by +1 (Character window).
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
          })}
        </ul>
      )}
      {away && <p className="sheet__meta">The shop is closed while you are on an expedition.</p>}
    </Sheet>
  )
}
