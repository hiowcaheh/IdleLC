import { useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import { GameError } from '../../game/logic/character.ts'
import { MAX_BUY, buyPrice } from '../../game/logic/shop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { fmt } from '../gear/format.ts'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from './ItemIcon.tsx'

const QUICK = [1, 10, 100]

/**
 * How many to buy, in a small window: typed in, slid or picked (1 / 10 / 100 / Max), at most
 * MAX_BUY and what the gold pays for; the total under it.
 */
export function BuyDialog({ itemId, onClose }: { itemId: number; onClose(): void }) {
  const gold = useGameStore((s) => s.character?.gold ?? 0)
  const buyItem = useGameStore((s) => s.buyItem)
  const [amount, setAmount] = useState(1)
  const [text, setText] = useState('1')
  const [busy, setBusy] = useState(false)
  const item = getItem(itemId)
  const price = buyPrice(itemId)
  const max = Math.max(0, Math.min(MAX_BUY, Math.floor(gold / price)))
  const count = Math.min(amount, max)

  const set = (value: number) => {
    const next = Math.max(1, Math.min(max, Math.round(value) || 1))
    setAmount(next)
    setText(String(next))
  }

  const buy = async () => {
    if (busy || count < 1) return
    setBusy(true)
    try {
      await buyItem(itemId, count)
      toast(`Bought ${count > 1 ? `${fmt(count)}× ` : ''}${item.name}.`)
      onClose()
    } catch (error) {
      toast(
        error instanceof GameError && error.code === 'not-enough-gold'
          ? 'Not enough gold.'
          : 'That is not possible right now.',
        'error',
      )
      setBusy(false)
    }
  }

  return (
    <Sheet centered title="Buy" titleId="buy-title" onClose={onClose}>
      <div className="item-info">
        <div className="item-info__head">
          <ItemIcon item={item} size={44} />
          <span className="item-info__title">
            <span className="item-info__name">{item.name}</span>
            <span className="item-info__kind">
              <span className="coin coin--small" aria-hidden="true" /> {fmt(price)} each
            </span>
          </span>
        </div>
        {max < 1 ? (
          <p className="sheet__empty">Not enough gold.</p>
        ) : (
          <>
            <div className="buy-dialog__amount">
              <button
                type="button"
                className="button buy-dialog__step"
                aria-label="One less"
                disabled={count <= 1}
                onClick={() => set(count - 1)}
              >
                −
              </button>
              <input
                className="buy-dialog__input"
                inputMode="numeric"
                aria-label="Amount"
                value={text}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 3)
                  // more than the gold pays for (or MAX_BUY) shows the most there is
                  if (Number(digits) > max) set(max)
                  else {
                    setText(digits)
                    if (digits) setAmount(Math.max(1, Number(digits)))
                  }
                }}
                onBlur={() => set(amount)}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="button buy-dialog__step"
                aria-label="One more"
                disabled={count >= max}
                onClick={() => set(count + 1)}
              >
                +
              </button>
            </div>
            <input
              type="range"
              className="buy-dialog__slider"
              aria-label="Amount"
              min={1}
              max={max}
              value={count}
              disabled={max <= 1}
              onChange={(e) => set(Number(e.target.value))}
            />
            <div className="buy-dialog__quick">
              {QUICK.filter((q) => q < max).map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`grade-chip${count === q ? ' is-active' : ''}`}
                  onClick={() => set(q)}
                >
                  {q}
                </button>
              ))}
              <button
                type="button"
                className={`grade-chip${count === max ? ' is-active' : ''}`}
                onClick={() => set(max)}
              >
                Max {fmt(max)}
              </button>
            </div>
            <dl className="hero-stats hero-stats--single item-info__stats">
              <div>
                <dt>Total</dt>
                <dd>{fmt(price * count)}</dd>
              </div>
              <div>
                <dt>Gold left</dt>
                <dd>{fmt(gold - price * count)}</dd>
              </div>
            </dl>
          </>
        )}
        <div className="item-row__actions buy-dialog__actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--gold"
            disabled={busy || count < 1}
            onClick={buy}
          >
            Buy {count > 0 ? fmt(count) : ''}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
