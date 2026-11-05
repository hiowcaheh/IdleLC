import { Gold } from '../Gold.tsx'
import { useState, type ReactNode } from 'react'
import { getItem } from '../../game/data/items.ts'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { AFK_MAX_SECONDS } from '../../game/logic/afk.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { POTION_GROUPS, countOwned, type PotionGroup } from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { formatSp } from '../skills/format.ts'
import { duration, fmt } from './format.ts'
import { useHourlyEstimate } from './useHourlyEstimate.ts'

const SLOT_NAMES: Record<PotionGroup, string> = { hp: 'HP slot', mp: 'MP slot' }

/** A potion the hero takes along: where it sits, how many an hour go and how long the bag lasts. */
interface Supply {
  itemId: number
  slot: PotionGroup | null
  auto: boolean
  perHour: number
  owned: number
}

/**
 * The potions an expedition uses: the ones in the quick slots (the hero drinks only those, and
 * only with AUTO on) and any other the measured hunt drinks, with the use per hour.
 */
function supplies(character: CharacterData, perHour: Record<number, number>): Supply[] {
  const rows: Supply[] = []
  for (const group of POTION_GROUPS) {
    const slot = character.potionSlots[group]
    if (slot.itemId === null) continue
    rows.push({
      itemId: slot.itemId,
      slot: group,
      auto: slot.auto,
      perHour: perHour[slot.itemId] ?? 0,
      owned: countOwned(character.inventory, slot.itemId),
    })
  }
  for (const [id, used] of Object.entries(perHour)) {
    const itemId = Number(id)
    if (used <= 0 || rows.some((row) => row.itemId === itemId)) continue
    rows.push({
      itemId,
      slot: null,
      auto: true,
      perHour: used,
      owned: countOwned(character.inventory, itemId),
    })
  }
  return rows
}

/** How long the bag's potions last at this rate, within the expedition's limit. */
function lasts(supply: Supply): string {
  if (!supply.auto) return 'AUTO off'
  if (supply.owned === 0) return 'None in the bag'
  if (supply.perHour < 0.05) return 'Hardly used'
  const seconds = (supply.owned / supply.perHour) * 3600
  return seconds >= AFK_MAX_SECONDS
    ? `Lasts the whole ${duration(AFK_MAX_SECONDS)}`
    : `Lasts ${duration(seconds)}`
}

/**
 * Confirms sending the character on an AFK expedition: the hunt, the expected rewards per hour and
 * the potions it will use, in the client's window, sections and buttons.
 */
export function ExpeditionDialog({
  character,
  onClose,
}: {
  character: CharacterData
  onClose(): void
}) {
  const startExpedition = useGameStore((s) => s.startExpedition)
  const running = useGameStore((s) => s.hud.phase === 'traveling')
  const { zoneId, monsterId } = character.location
  const monster = getMonster(monsterId)
  const estimate = useHourlyEstimate(character, monsterId)
  const potions = supplies(character, estimate.potionsPerHour)
  const [busy, setBusy] = useState(false)

  const onSend = async () => {
    if (busy || running) return
    setBusy(true)
    try {
      await startExpedition()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const rewards: [string, ReactNode, string?][] = [
    ['Kills', fmt(estimate.killsPerHour)],
    ['Deaths', fmt(estimate.deathsPerHour), estimate.deathsPerHour > 0 ? 'is-bad' : undefined],
    ['EXP', fmt(estimate.expPerHour), 'is-exp'],
    ['SP', formatSp(estimate.spPerHour)],
    ['Gold', <Gold amount={estimate.goldPerHour} />, 'is-gold'],
  ]

  return (
    <Sheet
      title="Expedition"
      titleId="expedition-title"
      centered
      className="sheet--client sheet--expedition"
      onClose={onClose}
    >
      <p className="expedition-dialog__intro">
        {character.name} will hunt <strong>{monster.name}</strong> in {ZONES[zoneId]?.name} while
        you are away, up to {duration(AFK_MAX_SECONDS)}. Come back any time to collect.
      </p>

      <h3 className="expedition-dialog__heading">Expected per hour</h3>
      <dl className="expedition-dialog__stats">
        {rewards.map(([label, value, tone]) => (
          <div key={label} className={tone}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="expedition-dialog__heading">Potions per hour</h3>
      {potions.length === 0 ? (
        <p className="expedition-dialog__note">
          No potions in the quick slots: the hero will not drink any. Put potions in the HP and MP
          slots to take them along.
        </p>
      ) : (
        <ul className="expedition-dialog__supplies">
          {potions.map((supply) => {
            const item = getItem(supply.itemId)
            const short = supply.auto && supply.owned > 0 && supply.owned < supply.perHour
            return (
              <li key={supply.itemId} className="expedition-dialog__supply">
                <ItemIcon item={item} size={30} />
                <span className="expedition-dialog__supply-text">
                  <span className="expedition-dialog__supply-name">{item.name}</span>
                  <span className="expedition-dialog__supply-meta">
                    {supply.slot ? SLOT_NAMES[supply.slot] : 'Other potion'} · {fmt(supply.owned)}{' '}
                    in the bag
                  </span>
                </span>
                <span className="expedition-dialog__supply-use">
                  <span className="expedition-dialog__per-hour">
                    {!supply.auto
                      ? '×0'
                      : supply.perHour > 0 && supply.perHour < 0.5
                        ? '<1'
                        : `×${fmt(supply.perHour)}`}
                    <small> / h</small>
                  </span>
                  <span className={`expedition-dialog__lasts${short ? ' is-short' : ''}`}>
                    {lasts(supply)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {estimate.killsPerHour === 0 && (
        <p className="expedition-dialog__warning">
          {monster.name} is too strong. Your hero would not win a single fight.
        </p>
      )}

      <div className="expedition-dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--gold"
          onClick={onSend}
          disabled={busy || running}
        >
          Send
        </button>
      </div>
    </Sheet>
  )
}
