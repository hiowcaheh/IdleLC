import { useState } from 'react'
import { EQUIP_SLOTS, GOLDEN_MAGNIFIER_ID, MAGNIFIER_ID, getItem } from '../../game/data/items.ts'
import type { EquipSlot } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import type { GearPiece } from '../../game/logic/equipment.ts'
import { optionValue } from '../../game/logic/options.ts'
import {
  GRADES,
  isRare,
  isUnidentified,
  rareSetOf,
  type IdentifyTarget,
} from '../../game/logic/rare.ts'
import { buyPrice, sellPrice } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { SLOT_LABELS, fmt, gearLine, nameTone, pieceName } from './format.ts'
import { OptionList } from './OptionList.tsx'

const GLASSES = [GOLDEN_MAGNIFIER_ID, MAGNIFIER_ID]

/** Best first: grade (A first), then more options, then stronger options, then higher level. */
function compareQuality(a: GearPiece, b: GearPiece): number {
  const grade = (p: GearPiece) => rareSetOf(p)?.grade ?? GRADES.length
  const total = (p: GearPiece) => (p.options ?? []).reduce((sum, o) => sum + optionValue(o), 0)
  return (
    grade(a) - grade(b) ||
    (b.options?.length ?? 0) - (a.options?.length ?? 0) ||
    total(b) - total(a) ||
    getItem(b.itemId).level - getItem(a.itemId).level
  )
}

/**
 * The Appraiser: identifies every unidentified rare item with magnifying glasses, then lists the
 * identified pieces best first so the weaker grades can be selected and sold together.
 */
export function AppraiserPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const identifyItems = useGameStore((s) => s.identifyItems)
  const sellGear = useGameStore((s) => s.sellGear)
  const buyItem = useGameStore((s) => s.buyItem)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!character) return null

  const away = character.expedition !== null
  const owned = (itemId: number) => character.inventory.find((s) => s.itemId === itemId)?.count ?? 0
  const worn = EQUIP_SLOTS.filter((slot) => {
    const piece = character.equipment[slot]
    return piece !== undefined && isUnidentified(piece)
  })
  const stacks = character.inventory.filter((s) => isRare(s.itemId))
  const pieces = character.gear.filter(isUnidentified)
  const pending = worn.length + pieces.length + stacks.reduce((sum, s) => sum + s.count, 0)
  const targets: IdentifyTarget[] = [
    ...worn.map((slot) => ({ slot })),
    ...pieces.map((p) => ({ uid: p.uid })),
    ...stacks.map((s) => ({ itemId: s.itemId, count: s.count })),
  ]
  const identified = character.gear.filter((p) => p.rare !== undefined).sort(compareQuality)
  const grades = GRADES.map((letter, grade) => ({
    letter,
    uids: identified.filter((p) => rareSetOf(p)?.grade === grade).map((p) => p.uid),
  })).filter((g) => g.uids.length > 0)
  const chosen = identified.filter((p) => selected.has(p.uid))
  const value = chosen.reduce((sum, p) => sum + sellPrice(p.itemId), 0)

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      setMessage(await action())
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

  const identifyAll = (glassId: number) =>
    run(async () => {
      const result = await identifyItems(glassId, targets)
      const done = result.results.filter((r) => r.success)
      setFresh((prev) => new Set([...prev, ...done.map((r) => r.piece.uid)]))
      const failed = result.used - done.length
      return `Identified ${done.length} of ${result.used}${failed ? ` — ${failed} glasses failed` : ''}.`
    })

  const toggle = (uids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const uid of uids) {
        if (on) next.add(uid)
        else next.delete(uid)
      }
      return next
    })

  const sellSelected = () =>
    run(async () => {
      const sale = await sellGear(chosen.map((p) => p.uid))
      setSelected(new Set())
      return `Sold ${sale.sold} ${sale.sold === 1 ? 'piece' : 'pieces'} for ${fmt(sale.gold)} gold.`
    })

  const unidentifiedRow = (key: string, itemId: number, label: string) => (
    <li key={key} className="item-row">
      <span className="item-row__main">
        <ItemIcon item={getItem(itemId)} />
        <span className="item-row__body">
          <span className={`item-row__name${nameTone({ itemId })}`}>{getItem(itemId).name}</span>
          <span className="item-row__meta">{label}</span>
        </span>
      </span>
    </li>
  )

  return (
    <Sheet
      title="Appraiser"
      titleId="appraiser-title"
      onClose={onClose}
      extra={
        <p className="shop__gold" aria-label={`${fmt(character.gold)} gold`}>
          <span className="coin" aria-hidden="true" /> {fmt(character.gold)}
        </p>
      }
    >
      <p className="sheet__meta">
        Rare weapons and armor come unidentified. A magnifying glass reveals one piece's rare
        options and grade.
      </p>
      <p className="inventory__status" role="status">
        {message ?? ''}
      </p>

      <ul className="appraiser__glasses">
        {GLASSES.map((id) => {
          const item = getItem(id)
          const chance = item.magnifier?.chance ?? 1
          const count = owned(id)
          const uses = Math.min(count, pending)
          return (
            <li key={id} className="appraiser__glass">
              <ItemIcon item={item} />
              <span className="item-row__body">
                <span className="item-row__name">
                  {item.name} ×{fmt(count)}
                </span>
                <span className="item-row__meta">
                  {chance < 1 ? `Works ${Math.round(chance * 100)}%` : 'Always works'} ·{' '}
                  <span className="coin coin--small" aria-hidden="true" /> {fmt(buyPrice(id))}
                </span>
              </span>
              <span className="appraiser__glass-actions">
                <button
                  type="button"
                  className="button"
                  disabled={busy || away || character.gold < buyPrice(id)}
                  onClick={() =>
                    run(async () => {
                      await buyItem(id, 1)
                      return `Bought ${item.name}.`
                    })
                  }
                >
                  Buy
                </button>
                <button
                  type="button"
                  className="button button--gold"
                  disabled={busy || away || uses < 1}
                  onClick={() => identifyAll(id)}
                >
                  Identify {uses > 0 ? uses : 'all'}
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <h3 className="inventory__heading">Unidentified · {fmt(pending)}</h3>
      {pending === 0 ? (
        <p className="sheet__empty">
          Nothing to identify. Rare items drop from monsters from about level 70.
        </p>
      ) : (
        <ul className="item-list">
          {worn.map((slot: EquipSlot) =>
            unidentifiedRow(
              `worn-${slot}`,
              character.equipment[slot]!.itemId,
              `Worn · ${SLOT_LABELS[slot]}`,
            ),
          )}
          {pieces.map((p) => unidentifiedRow(p.uid, p.itemId, `In the bag · +${p.plus}`))}
          {stacks.map((s) => unidentifiedRow(`stack-${s.itemId}`, s.itemId, `×${fmt(s.count)}`))}
        </ul>
      )}

      <h3 className="inventory__heading">Identified in your bag · {fmt(identified.length)}</h3>
      {identified.length === 0 ? (
        <p className="sheet__empty">Identified pieces appear here, best first.</p>
      ) : (
        <>
          <div className="appraiser__select" role="group" aria-label="Select by grade">
            {grades.map((g) => {
              const all = g.uids.every((uid) => selected.has(uid))
              return (
                <button
                  key={g.letter}
                  type="button"
                  className={`grade-chip name--grade-${g.letter}${all ? ' is-active' : ''}`}
                  aria-pressed={all}
                  onClick={() => toggle(g.uids, !all)}
                >
                  {g.letter} ×{g.uids.length}
                </button>
              )
            })}
          </div>
          <ul className="item-list">
            {identified.map((piece) => {
              const set = rareSetOf(piece)
              const checked = selected.has(piece.uid)
              return (
                <li
                  key={piece.uid}
                  className={`item-row appraiser__row${checked ? ' is-open' : ''}`}
                >
                  <label className="item-row__main">
                    <input
                      type="checkbox"
                      className="appraiser__check"
                      checked={checked}
                      onChange={(e) => toggle([piece.uid], e.target.checked)}
                    />
                    <ItemIcon item={getItem(piece.itemId)} />
                    <span className="item-row__body">
                      <span className={`item-row__name${nameTone(piece)}`}>
                        {pieceName(piece.itemId, piece.plus, piece.rare)}
                      </span>
                      <span className="item-row__meta">
                        Grade {set ? GRADES[set.grade] : '?'}
                        {fresh.has(piece.uid) ? ' · New' : ''} ·{' '}
                        {gearLine(piece.itemId, piece.plus, piece.rare)}
                      </span>
                      <OptionList options={piece.options} classId={character.classId} />
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="button button--wide inventory__sell-all"
            disabled={busy || chosen.length === 0}
            onClick={sellSelected}
          >
            {chosen.length === 0
              ? 'Select pieces to sell'
              : `Sell ${chosen.length} selected · +${fmt(value)} gold`}
          </button>
          <p className="sheet__meta inventory__keep-note">
            Wear identified pieces from the Inventory.
          </p>
        </>
      )}
      {away && (
        <p className="sheet__meta">The Appraiser is closed while you are on an expedition.</p>
      )}
    </Sheet>
  )
}
