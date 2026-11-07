/**
 * A dungeon box in the bag (data/boxes.ts): Open, Multi-open (how many, chosen in a window) and "?"
 * (what the box holds and the chance of each prize). What comes out rises on the left like a drop
 * (BagFeed); opening more than one also lists the prizes in a window.
 */
import { useState } from 'react'
import { BOX_PRIZES } from '../../game/data/boxes.ts'
import { getItem } from '../../game/data/items.ts'
import { MAX_BOXES_AT_ONCE } from '../../game/logic/boxes.ts'
import type { ItemStack } from '../../game/logic/loot.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { fmt } from '../gear/format.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from './ItemIcon.tsx'

export function BoxActions({
  itemId,
  count,
  disabled,
}: {
  itemId: number
  count: number
  disabled: boolean
}) {
  const openBoxes = useGameStore((s) => s.openBoxes)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [contents, setContents] = useState(false)
  const [results, setResults] = useState<{ opened: number; prizes: ItemStack[] } | null>(null)

  const open = async (n: number) => {
    if (busy) return
    setBusy(true)
    try {
      const prizes = await openBoxes(itemId, n)
      if (n > 1) setResults({ opened: n, prizes })
    } catch {
      toast('The boxes could not be opened.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="button button--gold"
        disabled={busy || disabled}
        onClick={() => open(1)}
      >
        Open
      </button>
      {count > 1 && (
        <button
          type="button"
          className="button button--gold"
          disabled={busy || disabled}
          onClick={() => setChoosing(true)}
        >
          Multi-open
        </button>
      )}
      <button
        type="button"
        className="button box-help"
        aria-label="What is inside"
        title="What is inside"
        onClick={() => setContents(true)}
      >
        ?
      </button>
      {choosing && (
        <MultiOpenDialog
          itemId={itemId}
          owned={count}
          onOpen={(n) => {
            setChoosing(false)
            void open(n)
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      {contents && <BoxContents itemId={itemId} onClose={() => setContents(false)} />}
      {results && (
        <BoxResults
          itemId={itemId}
          opened={results.opened}
          prizes={results.prizes}
          onClose={() => setResults(null)}
        />
      )}
    </>
  )
}

/** How many boxes to open at once: − / + / slider / Max, at most what the bag holds. */
function MultiOpenDialog({
  itemId,
  owned,
  onOpen,
  onClose,
}: {
  itemId: number
  owned: number
  onOpen(count: number): void
  onClose(): void
}) {
  const max = Math.min(owned, MAX_BOXES_AT_ONCE)
  const [amount, setAmount] = useState(Math.min(10, max))
  const set = (n: number) => setAmount(Math.max(1, Math.min(max, Math.round(n) || 1)))
  const box = getItem(itemId)
  return (
    <Sheet
      centered
      title="Multi-open"
      titleId="multi-open-title"
      className="sheet--buy"
      onClose={onClose}
    >
      <div className="box-dialog">
        <div className="item-info__head">
          <ItemIcon item={box} size={44} />
          <span className="item-info__title">
            <span className="item-info__name">{box.name}</span>
            <span className="item-info__kind">You have {fmt(owned)}</span>
          </span>
        </div>
        <div className="buy-dialog__amount">
          <button
            type="button"
            className="button buy-dialog__step"
            aria-label="One less"
            disabled={amount <= 1}
            onClick={() => set(amount - 1)}
          >
            −
          </button>
          <span className="buy-dialog__input box-dialog__count" aria-live="polite">
            {amount}
          </span>
          <button
            type="button"
            className="button buy-dialog__step"
            aria-label="One more"
            disabled={amount >= max}
            onClick={() => set(amount + 1)}
          >
            +
          </button>
        </div>
        {max > 1 && (
          <input
            type="range"
            aria-label="Boxes to open"
            min={1}
            max={max}
            value={amount}
            onChange={(e) => set(Number(e.target.value))}
          />
        )}
        <div className="buy-dialog__quick">
          {[10, 50, 100]
            .filter((q) => q < max)
            .map((q) => (
              <button
                key={q}
                type="button"
                className={`grade-chip${amount === q ? ' is-active' : ''}`}
                onClick={() => set(q)}
              >
                {q}
              </button>
            ))}
          <button
            type="button"
            className={`grade-chip${amount === max ? ' is-active' : ''}`}
            onClick={() => set(max)}
          >
            Max {fmt(max)}
          </button>
        </div>
        <button
          type="button"
          className="button button--gold button--wide"
          onClick={() => onOpen(amount)}
        >
          Open {fmt(amount)} {amount === 1 ? 'box' : 'boxes'}
        </button>
      </div>
    </Sheet>
  )
}

/** What a box holds and the chance of each prize ("?"). */
function BoxContents({ itemId, onClose }: { itemId: number; onClose(): void }) {
  const prizes = BOX_PRIZES[itemId] ?? []
  const total = prizes.reduce((sum, p) => sum + p.weight, 0)
  const box = getItem(itemId)
  return (
    <Sheet centered title={box.name} titleId="box-contents-title" onClose={onClose}>
      <div className="box-dialog">
        <p className="box-dialog__text">Opening the box gives one of these:</p>
        <table className="cash-contents">
          <thead>
            <tr>
              <th colSpan={2}>Prize</th>
              <th>Amount</th>
              <th>Chance</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((p) => {
              const item = getItem(p.itemId)
              return (
                <tr key={p.itemId}>
                  <td className="cash-contents__icon">
                    <span className="cash-contents__slot">
                      <ItemIcon item={item} size={28} />
                    </span>
                  </td>
                  <td className="cash-contents__name">{item.name}</td>
                  <td className="cash-contents__count">×{fmt(p.count)}</td>
                  <td className="cash-contents__worth box-dialog__chance">
                    {((p.weight / total) * 100).toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}
                    %
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="box-dialog__note">Monsters in its dungeon drop it (5% each).</p>
      </div>
    </Sheet>
  )
}

/** What a multi-open gave: each prize with its amount. */
function BoxResults({
  itemId,
  opened,
  prizes,
  onClose,
}: {
  itemId: number
  opened: number
  prizes: ItemStack[]
  onClose(): void
}) {
  return (
    <Sheet centered title="Boxes opened" titleId="box-results-title" onClose={onClose}>
      <div className="box-dialog">
        <p className="box-dialog__text">
          {fmt(opened)}× {getItem(itemId).name} gave:
        </p>
        <table className="cash-contents">
          <tbody>
            {prizes.map((p) => {
              const item = getItem(p.itemId)
              return (
                <tr key={p.itemId}>
                  <td className="cash-contents__icon">
                    <span className="cash-contents__slot">
                      <ItemIcon item={item} size={28} />
                    </span>
                  </td>
                  <td className="cash-contents__name">{item.name}</td>
                  <td className="cash-contents__count">×{fmt(p.count)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button type="button" className="button button--gold button--wide" onClick={onClose}>
          OK
        </button>
      </div>
    </Sheet>
  )
}
