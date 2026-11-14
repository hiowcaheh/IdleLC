/**
 * The item shop paid in Cash (owner's requests, 2026-11-07), built on the client's Cashshop.tex:
 * its category pictures on the tabs, its item panel for every offer (all the same size), its HOT /
 * NEW / D.C. tags, its gold-ended Cash bar and blue button (Donate), its icon slots in a package's
 * contents. Bought items also rise on the left of the screen (BagFeed).
 */
import { useState } from 'react'
import {
  CASH_OFFERS,
  CASH_PER_EURO,
  CASH_TABS,
  cashOfferWorth,
  cashSaving,
  cashUnitPrice,
  type CashOffer,
  type CashTab,
} from '../../game/data/cashShop.ts'
import { getItem } from '../../game/data/items.ts'
import { GameError } from '../../game/logic/character.ts'
import { MAX_CASH_PURCHASE } from '../../game/logic/cashShop.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { fmt } from '../gear/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { PotionInfo } from '../items/PotionNotes.tsx'
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
const pieces = (offer: CashOffer) => offer.items.reduce((sum, i) => sum + i.count, 0)
/** Under the name: the amount of a stack, or how much a package holds. */
const offerLine = (offer: CashOffer) =>
  offer.items.length > 1
    ? `${offer.items.length} kinds · ${fmt(pieces(offer))} items`
    : offer.items[0]!.count > 1
      ? `×${fmt(offer.items[0]!.count)}`
      : ''

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

/** The price, with the regular one struck through when it is cheaper (sale, package). */
function Price({ offer }: { offer: CashOffer }) {
  const worth = cashOfferWorth(offer)
  return (
    <span className="cash-price">
      {worth > offer.price && (
        <s className="cash-price__was" aria-label={`Regular price ${fmt(worth)} Cash`}>
          {fmt(worth)}
        </s>
      )}
      <Cash amount={offer.price} />
    </span>
  )
}

export function CashShopPanel({ onClose }: { onClose(): void }) {
  const cash = useGameStore((s) => s.save.cash)
  const [tab, setTab] = useState<CashTab>('hot')
  const [chosen, setChosen] = useState<CashOffer | null>(null)
  const [topUp, setTopUp] = useState(false)
  const offers = CASH_OFFERS.filter((o) => o.tabs.includes(tab))
  return (
    <Sheet
      title="Item Shop"
      titleId="cash-shop-title"
      className="sheet--fixed cash-shop"
      onClose={onClose}
      extra={
        <div className="cash-wallet">
          <button type="button" className="cash-button" onClick={() => setTopUp(true)}>
            Donate
          </button>
          <p className="shop__gold cash-wallet__box" aria-label={`${fmt(cash)} Cash`}>
            <span className="coin coin--small coin--cash" aria-hidden="true" />
            <span>{fmt(cash)}</span>
          </p>
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
        {offers.map((offer) => {
          const saving = cashSaving(offer)
          return (
            <li key={offer.id}>
              <button type="button" className="cash-offer" onClick={() => setChosen(offer)}>
                <span className="cash-offer__name">{offerName(offer)}</span>
                <span className="cash-offer__tags">
                  {offer.tag && (
                    <span className={`cash-tag cash-tag--${offer.tag}`}>
                      {offer.tag.toUpperCase()}
                    </span>
                  )}
                  {saving > 0 && <span className="cash-tag cash-tag--dc">D.C.</span>}
                </span>
                <span className="cash-offer__body">
                  <span className="cash-offer__slot">
                    <OfferIcon offer={offer} size={34} />
                  </span>
                  <span className="cash-offer__text">
                    <span className="cash-offer__line">{offerLine(offer)}</span>
                    {saving > 0 && <span className="cash-offer__saving">−{saving}%</span>}
                    <Price offer={offer} />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {chosen && <CashBuyDialog offer={chosen} onClose={() => setChosen(null)} />}
      {topUp && <TopUpInfo onClose={() => setTopUp(false)} />}
    </Sheet>
  )
}

/** What a package holds: icon, name, amount and what that costs on its own. */
function PackageContents({ offer }: { offer: CashOffer }) {
  return (
    <table className="cash-contents">
      <thead>
        <tr>
          <th colSpan={2}>Item</th>
          <th>Amount</th>
          <th>Alone</th>
        </tr>
      </thead>
      <tbody>
        {offer.items.map((i) => {
          const item = getItem(i.itemId)
          const unit = cashUnitPrice(i.itemId)
          return (
            <tr key={i.itemId}>
              <td className="cash-contents__icon">
                <span className="cash-contents__slot">
                  <ItemIcon item={item} size={28} />
                </span>
              </td>
              <td className="cash-contents__name">{item.name}</td>
              <td className="cash-contents__count">×{fmt(i.count)}</td>
              <td className="cash-contents__worth">
                {unit === undefined ? '' : fmt(unit * i.count)}
              </td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>Bought one by one</td>
          <td className="cash-contents__worth">{fmt(cashOfferWorth(offer))}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** What an offer is, in its detail window's head: a potion's duration, a package's size. */
function offerKind(offer: CashOffer): string {
  if (offer.items.length > 1) return `Package · ${fmt(pieces(offer))} items`
  const item = getItem(offer.items[0]!.itemId)
  const count = offer.items[0]!.count
  const what = item.potion ? 'Potion' : item.type === 'scroll' ? 'Scroll' : 'Item'
  const lasts = item.potion?.duration
  const time = !lasts
    ? ''
    : lasts >= 3600 && lasts % 3600 === 0
      ? ` · ${lasts / 3600} h`
      : ` · ${Math.round(lasts / 60)} min`
  return `${what}${time}${count > 1 ? ` · ×${fmt(count)}` : ''}`
}

/**
 * An offer's window: the item (or package) with its price on top, what it does (or holds) in the
 * middle, the purchase at the bottom on its own panel: amount, total and Cash left, Buy.
 */
function CashBuyDialog({ offer, onClose }: { offer: CashOffer; onClose(): void }) {
  const cash = useGameStore((s) => s.save.cash)
  const buy = useGameStore((s) => s.buyCashOffer)
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const max = Math.max(0, Math.min(MAX_CASH_PURCHASE, Math.floor(cash / offer.price)))
  const amount = Math.max(1, Math.min(count, Math.max(1, max)))
  const single = offer.items.length === 1 ? getItem(offer.items[0]!.itemId) : null
  const saving = cashSaving(offer)
  const worth = cashOfferWorth(offer)
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
    <Sheet
      centered
      title={offerName(offer)}
      titleId="cash-buy-title"
      className="sheet--buy cash-detail"
      onClose={onClose}
    >
      <div className="cash-detail__head">
        <span className="cash-contents__slot cash-contents__slot--big">
          <OfferIcon offer={offer} size={40} />
        </span>
        <span className="cash-detail__title">
          <span className="cash-detail__name">{offerName(offer)}</span>
          <span className="cash-detail__kind">{offerKind(offer)}</span>
        </span>
        <span className="cash-detail__price">
          {worth > offer.price && <s className="cash-price__was">{fmt(worth)}</s>}
          <Cash amount={offer.price} />
          {saving > 0 && <span className="cash-offer__saving">−{saving}%</span>}
        </span>
      </div>
      {single ? (
        <div className="cash-detail__body">
          {single.description && <p className="cash-detail__desc">{single.description}</p>}
          {single.potion && <PotionInfo potion={single.potion} />}
        </div>
      ) : (
        <PackageContents offer={offer} />
      )}
      <div className="cash-detail__buy">
        {max < 1 ? (
          <p className="sheet__empty">Not enough Cash.</p>
        ) : (
          <>
            <div className="cash-detail__amount">
              <span className="cash-detail__label">Amount</span>
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
            {max > 1 && (
              <input
                type="range"
                aria-label="Amount"
                min={1}
                max={max}
                value={amount}
                onChange={(e) => set(Number(e.target.value))}
              />
            )}
            <div className="cash-detail__sums">
              <span>
                <span className="cash-detail__label">Total</span>
                <Cash amount={offer.price * amount} />
              </span>
              <span>
                <span className="cash-detail__label">Cash left</span>
                <Cash amount={cash - offer.price * amount} />
              </span>
            </div>
            <button
              type="button"
              className="cash-button cash-button--wide"
              disabled={busy}
              onClick={confirm}
            >
              Buy
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}

/** Cash top-up packs shown in the information window (owner's text, 2026-11-07). */
const TOP_UPS: [euro: number, bonus: number][] = [
  [5, 0],
  [10, 500],
  [20, 2000],
  [50, 7500],
]

/** How to top up Cash: the rate, the packs, PayPal and Discord. */
function TopUpInfo({ onClose }: { onClose(): void }) {
  return (
    <Sheet centered title="Donate" titleId="cash-topup-title" onClose={onClose}>
      <div className="cash-topup">
        <div className="cash-topup__rate">
          <span className="cash-topup__coin" aria-hidden="true" />
          <span className="cash-topup__rate-text">
            <strong>1 €</strong> = <Cash amount={CASH_PER_EURO} />
          </span>
          <small>Bonus Cash from 10 €</small>
        </div>
        <ul className="cash-topup__packs" aria-label="Cash packs">
          {TOP_UPS.map(([euro, bonus]) => (
            <li key={euro} className="cash-topup__pack">
              <span className="cash-topup__euro">{euro} €</span>
              <span className="cash-topup__get">
                <span className="cash-topup__amount">{fmt(euro * CASH_PER_EURO + bonus)}</span>
                <span className="cash__unit">Cash</span>
              </span>
              <span className="cash-topup__bonus">{bonus ? `+${fmt(bonus)} bonus` : '\u00a0'}</span>
            </li>
          ))}
        </ul>
        <h3 className="cash-topup__head">How to donate</h3>
        <ol className="cash-topup__steps">
          <li>
            Pay with <strong>PayPal</strong> the amount of the pack you want.
          </li>
          <li>Write your hero's name in the payment note.</li>
          <li>The Cash reaches your account within 24 hours.</li>
        </ol>
        <h3 className="cash-topup__head">Questions</h3>
        <p className="cash-topup__text">
          Contact us on our <strong>Discord</strong> server: the team answers every day.
        </p>
        <p className="cash-topup__note">
          Donations open soon. The shop sells no upgrade stones and no gear.
        </p>
        <button type="button" className="cash-button cash-button--wide" onClick={onClose}>
          OK
        </button>
      </div>
    </Sheet>
  )
}
