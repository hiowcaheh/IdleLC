/**
 * The item shop paid in Cash (owner's request, 2026-11-07), in the client's Cashshop look: its
 * category pictures on the tabs, its HOT / NEW tags on the offers, the account's Cash at the top.
 */
import { useState } from 'react'
import { CASH_OFFERS, CASH_TABS, type CashOffer, type CashTab } from '../../game/data/cashShop.ts'
import { getItem } from '../../game/data/items.ts'
import { GameError } from '../../game/logic/character.ts'
import { MAX_CASH_PURCHASE } from '../../game/logic/cashShop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { fmt } from '../gear/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { PotionNotes } from '../items/PotionNotes.tsx'
import { Sheet } from '../Sheet.tsx'
import './cashShop.css'

export function CashShopButton({ onClick }: { onClick(): void }) {
  const away = useGameStore((s) => !!s.character?.expedition)
  return (
    <button
      type="button"
      className="icon-button hud__menu hud__menu--shop"
      aria-label="Item shop"
      title="Shop"
      disabled={away}
      onClick={onClick}
    />
  )
}

export function Cash({ amount }: { amount: number }) {
  return (
    <span className="cash">
      <span className="cash__amount">{fmt(amount)}</span> <span className="cash__unit">Cash</span>
    </span>
  )
}

const offerName = (offer: CashOffer) => offer.name ?? getItem(offer.items[0]!.itemId).name
const contents = (offer: CashOffer) =>
  offer.items.map((i) => `${getItem(i.itemId).name} ×${fmt(i.count)}`).join(', ')

function OfferIcon({ offer, size }: { offer: CashOffer; size: number }) {
  return offer.items.length > 1 ? (
    <span
      className="cash-offer__package"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  ) : (
    <ItemIcon item={getItem(offer.items[0]!.itemId)} size={size} />
  )
}

export function CashShopPanel({ onClose }: { onClose(): void }) {
  const cash = useGameStore((s) => s.save.cash)
  const [tab, setTab] = useState<CashTab>('hot')
  const [chosen, setChosen] = useState<CashOffer | null>(null)
  const offers = CASH_OFFERS.filter((o) => o.tabs.includes(tab))
  return (
    <Sheet
      title="Item Shop"
      titleId="cash-shop-title"
      className="sheet--fixed cash-shop"
      onClose={onClose}
      extra={
        <div className="cash-wallet" aria-label="Your Cash">
          <Cash amount={cash} />
        </div>
      }
    >
      <div className="tabs cash-tabs" role="tablist" aria-label="Shop pages">
        {CASH_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`tabs__tab cash-tabs__tab cash-tabs__tab--${t.id}${tab === t.id ? ' is-active' : ''}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span className="cash-tabs__picture" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>
      <ul className="cash-offers">
        {offers.map((offer) => (
          <li key={offer.id}>
            <button type="button" className="cash-offer" onClick={() => setChosen(offer)}>
              {offer.tag && (
                <span className={`cash-offer__tag cash-offer__tag--${offer.tag}`}>
                  {offer.tag.toUpperCase()}
                </span>
              )}
              <span className="cash-offer__slot">
                <OfferIcon offer={offer} size={40} />
              </span>
              <span className="cash-offer__text">
                <span className="cash-offer__name">{offerName(offer)}</span>
                {(offer.items.length > 1 || offer.items[0]!.count > 1) && (
                  <span className="cash-offer__contents">{contents(offer)}</span>
                )}
                <Cash amount={offer.price} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {cash === 0 && (
        <p className="sheet__empty cash-shop__hint">No Cash yet: it will come from events.</p>
      )}
      {chosen && <CashBuyDialog offer={chosen} onClose={() => setChosen(null)} />}
    </Sheet>
  )
}

/** How many to buy, like the gold shop's window; the total in Cash under it. */
function CashBuyDialog({ offer, onClose }: { offer: CashOffer; onClose(): void }) {
  const cash = useGameStore((s) => s.save.cash)
  const buy = useGameStore((s) => s.buyCashOffer)
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const max = Math.max(0, Math.min(MAX_CASH_PURCHASE, Math.floor(cash / offer.price)))
  const amount = Math.max(1, Math.min(count, Math.max(1, max)))
  const single = offer.items.length === 1 ? getItem(offer.items[0]!.itemId) : null
  const set = (n: number) => setCount(Math.max(1, Math.min(Math.max(1, max), Math.round(n) || 1)))

  const confirm = async () => {
    if (busy || max < 1) return
    setBusy(true)
    try {
      await buy(offer.id, amount)
      toast(`Bought ${amount > 1 ? `${fmt(amount)}× ` : ''}${offerName(offer)}. It is in your bag.`)
      onClose()
    } catch (error) {
      toast(
        error instanceof GameError && error.code === 'not-enough-cash'
          ? 'Not enough Cash.'
          : 'That is not possible right now.',
        'error',
      )
      setBusy(false)
    }
  }

  return (
    <Sheet centered title="Buy" titleId="cash-buy-title" className="sheet--buy" onClose={onClose}>
      <div className="item-info buy-dialog cash-buy">
        <div className="item-info__head">
          <OfferIcon offer={offer} size={44} />
          <span className="item-info__title">
            <span className="item-info__name">{offerName(offer)}</span>
            <span className="item-info__kind">
              <Cash amount={offer.price} /> each
            </span>
          </span>
        </div>
        <p className="cash-buy__contents">{contents(offer)}</p>
        {single?.potion && <PotionNotes potion={single.potion} />}
        {max < 1 ? (
          <p className="sheet__empty">Not enough Cash.</p>
        ) : (
          <>
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
              <span className="buy-dialog__input cash-buy__count" aria-live="polite">
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
            <input
              type="range"
              aria-label="Amount"
              min={1}
              max={max}
              value={amount}
              disabled={max <= 1}
              onChange={(e) => set(Number(e.target.value))}
            />
            <dl className="hero-stats hero-stats--single item-info__stats">
              <div>
                <dt>Total</dt>
                <dd>
                  <Cash amount={offer.price * amount} />
                </dd>
              </div>
              <div>
                <dt>Cash left</dt>
                <dd>
                  <Cash amount={cash - offer.price * amount} />
                </dd>
              </div>
            </dl>
            <button type="button" className="button button--gold" disabled={busy} onClick={confirm}>
              Buy
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
