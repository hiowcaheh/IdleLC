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
import { toast } from '../../state/toasts.ts'
import { BuyDialog } from '../items/BuyDialog.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { SLOT_LABELS, fmt, gearLine, nameTone, pieceName } from './format.ts'
import { OptionList } from './OptionList.tsx'

const GLASSES = [GOLDEN_MAGNIFIER_ID, MAGNIFIER_ID]

type Tab = 'unidentified' | 'identified'

/** An unidentified rare item: worn, a single piece in the bag or a stack of them. */
interface Pending {
  key: string
  itemId: number
  count: number
  label: string
  target: IdentifyTarget
}

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
 * The Appraiser on two tabs. Unidentified: the player picks the rare items to identify (all with one
 * tap) and spends magnifying glasses on them. Identified: the pieces best first, selected by grade
 * or one by one and sold together; the grade chips and the sell button stay at the top.
 */
export function AppraiserPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const identifyItems = useGameStore((s) => s.identifyItems)
  const sellGear = useGameStore((s) => s.sellGear)
  const [tab, setTab] = useState<Tab>('unidentified')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [buying, setBuying] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  if (!character) return null

  const away = character.expedition !== null
  const owned = (itemId: number) => character.inventory.find((s) => s.itemId === itemId)?.count ?? 0
  const pending: Pending[] = [
    ...EQUIP_SLOTS.flatMap((slot: EquipSlot) => {
      const piece = character.equipment[slot]
      return piece && isUnidentified(piece)
        ? [
            {
              key: `worn-${slot}`,
              itemId: piece.itemId,
              count: 1,
              label: `Worn · ${SLOT_LABELS[slot]}`,
              target: { slot },
            },
          ]
        : []
    }),
    ...character.gear.filter(isUnidentified).map((p) => ({
      key: p.uid,
      itemId: p.itemId,
      count: 1,
      label: `In the bag · +${p.plus}`,
      target: { uid: p.uid },
    })),
    ...character.inventory
      .filter((s) => isRare(s.itemId))
      .map((s) => ({
        key: `stack-${s.itemId}`,
        itemId: s.itemId,
        count: s.count,
        label: `×${fmt(s.count)}`,
        target: { itemId: s.itemId, count: s.count },
      })),
  ]
  const pendingCount = pending.reduce((sum, p) => sum + p.count, 0)
  const picks = pending.filter((p) => picked.has(p.key))
  const pickedCount = picks.reduce((sum, p) => sum + p.count, 0)
  const allPicked = pending.length > 0 && picks.length === pending.length

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
      toast(await action())
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

  const identifyPicked = (glassId: number) =>
    run(async () => {
      const result = await identifyItems(
        glassId,
        picks.map((p) => p.target),
      )
      const done = result.results.filter((r) => r.success)
      setFresh((prev) => new Set([...prev, ...done.map((r) => r.piece.uid)]))
      setPicked(new Set())
      if (done.length > 0) setTab('identified')
      const failed = result.used - done.length
      return `Identified ${done.length} of ${result.used}${failed ? ` — ${failed} glasses failed` : ''}.`
    })

  const toggle = (
    set: (update: (prev: Set<string>) => Set<string>) => void,
    keys: string[],
    on: boolean,
  ) =>
    set((prev) => {
      const next = new Set(prev)
      for (const key of keys) {
        if (on) next.add(key)
        else next.delete(key)
      }
      return next
    })

  const sellSelected = () =>
    run(async () => {
      const sale = await sellGear(chosen.map((p) => p.uid))
      setSelected(new Set())
      return `Sold ${sale.sold} ${sale.sold === 1 ? 'piece' : 'pieces'} for ${fmt(sale.gold)} gold.`
    })

  const tabs: { id: Tab; label: string }[] = [
    { id: 'unidentified', label: `Unidentified · ${fmt(pendingCount)}` },
    { id: 'identified', label: `Identified · ${fmt(identified.length)}` },
  ]

  return (
    <Sheet
      title="Appraiser"
      className="sheet--fixed"
      titleId="appraiser-title"
      onClose={onClose}
      extra={
        <p className="shop__gold" aria-label={`${fmt(character.gold)} gold`}>
          <span className="coin" aria-hidden="true" /> {fmt(character.gold)}
        </p>
      }
    >
      <div className="tabs" role="tablist" aria-label="Appraiser">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tabs__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'unidentified' && (
        <>
          <p className="sheet__meta">
            Rare weapons and armor come unidentified. Pick the items, then use a magnifying glass on
            each — it reveals the piece's grade and rare options.
          </p>
          <ul className="appraiser__glasses">
            {GLASSES.map((id) => {
              const item = getItem(id)
              const chance = item.magnifier?.chance ?? 1
              const count = owned(id)
              const uses = Math.min(count, pickedCount)
              return (
                <li key={id} className="appraiser__glass">
                  <ItemIcon item={item} />
                  <span className="item-row__body">
                    <span className="item-row__name">
                      {item.name} ×{fmt(count)}
                    </span>
                    <span className="item-row__meta">
                      Works {Math.round(chance * 100)}% ·{' '}
                      <span className="coin coin--small" aria-hidden="true" /> {fmt(buyPrice(id))}
                    </span>
                  </span>
                  <span className="appraiser__glass-actions">
                    <button
                      type="button"
                      className="button"
                      disabled={busy || away || character.gold < buyPrice(id)}
                      onClick={() => setBuying(id)}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      className="button button--gold"
                      disabled={busy || away || uses < 1}
                      onClick={() => identifyPicked(id)}
                    >
                      Identify{uses > 0 ? ` ${fmt(uses)}` : ''}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          {pending.length === 0 ? (
            <p className="sheet__empty">
              Nothing to identify. Rare items drop from monsters from about level 70.
            </p>
          ) : (
            <>
              <div className="appraiser__bar">
                <button
                  type="button"
                  className={`grade-chip appraiser__all${allPicked ? ' is-active' : ''}`}
                  aria-pressed={allPicked}
                  onClick={() =>
                    toggle(
                      setPicked,
                      pending.map((p) => p.key),
                      !allPicked,
                    )
                  }
                >
                  All ×{fmt(pendingCount)}
                </button>
                <span className="appraiser__picked">
                  {pickedCount > 0 ? `${fmt(pickedCount)} picked` : 'Pick items to identify'}
                </span>
              </div>
              <ul className="item-list">
                {pending.map((p) => {
                  const checked = picked.has(p.key)
                  return (
                    <li
                      key={p.key}
                      className={`item-row appraiser__row${checked ? ' is-open' : ''}`}
                    >
                      <label className="item-row__main">
                        <input
                          type="checkbox"
                          className="appraiser__check"
                          checked={checked}
                          onChange={(e) => toggle(setPicked, [p.key], e.target.checked)}
                        />
                        <ItemIcon item={getItem(p.itemId)} />
                        <span className="item-row__body">
                          <span className={`item-row__name${nameTone({ itemId: p.itemId })}`}>
                            {getItem(p.itemId).name}
                          </span>
                          <span className="item-row__meta">
                            {p.label} · Lv {getItem(p.itemId).level}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}

      {tab === 'identified' &&
        (identified.length === 0 ? (
          <p className="sheet__empty">Identified pieces appear here, best first.</p>
        ) : (
          <>
            <div className="appraiser__bar appraiser__bar--sticky">
              <div className="appraiser__select" role="group" aria-label="Select by grade">
                {grades.map((g) => {
                  const all = g.uids.every((uid) => selected.has(uid))
                  return (
                    <button
                      key={g.letter}
                      type="button"
                      className={`grade-chip name--grade-${g.letter}${all ? ' is-active' : ''}`}
                      aria-pressed={all}
                      onClick={() => toggle(setSelected, g.uids, !all)}
                    >
                      {g.letter} ×{g.uids.length}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="button button--wide"
                disabled={busy || chosen.length === 0}
                onClick={sellSelected}
              >
                {chosen.length === 0
                  ? 'Select pieces to sell'
                  : `Sell ${chosen.length} selected · +${fmt(value)} gold`}
              </button>
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
                        onChange={(e) => toggle(setSelected, [piece.uid], e.target.checked)}
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
                        <OptionList
                          options={piece.options}
                          classId={character.classId}
                          tone={nameTone(piece)}
                        />
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <p className="sheet__meta inventory__keep-note">
              Wear identified pieces from the Inventory.
            </p>
          </>
        ))}
      {away && (
        <p className="sheet__meta">The Appraiser is closed while you are on an expedition.</p>
      )}
      {buying !== null && <BuyDialog itemId={buying} onClose={() => setBuying(null)} />}
    </Sheet>
  )
}
