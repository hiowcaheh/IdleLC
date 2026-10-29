import { useEffect, useRef, useState } from 'react'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { AFK_MAX_SECONDS } from '../../game/logic/afk.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { duration, fmt } from './format.ts'
import { useHourlyEstimate } from './useHourlyEstimate.ts'

/** Confirms sending the character on an AFK expedition, with the expected rewards per hour. */
export function ExpeditionDialog({
  character,
  onClose,
}: {
  character: CharacterData
  onClose(): void
}) {
  const startExpedition = useGameStore((s) => s.startExpedition)
  const { zoneId, monsterId } = character.location
  const monster = getMonster(monsterId)
  const estimate = useHourlyEstimate(character.classId, character.level, monsterId)
  const [busy, setBusy] = useState(false)
  const confirm = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    confirm.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onSend = async () => {
    setBusy(true)
    await startExpedition()
    onClose()
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--center" onClick={onClose}>
      <div
        className="sheet expedition-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="expedition-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="expedition-title" className="afk__title">
          Send on an expedition
        </h2>
        <p className="afk__subtitle">
          {character.name} will hunt <strong>{monster.name}</strong> in {ZONES[zoneId]?.name} while
          you are away — up to {duration(AFK_MAX_SECONDS)}. Come back any time to collect.
        </p>

        <h3 className="afk__heading">Expected per hour</h3>
        <dl className="afk__stats">
          <div>
            <dt>Kills</dt>
            <dd>{fmt(estimate.killsPerHour)}</dd>
          </div>
          <div>
            <dt>Deaths</dt>
            <dd>{fmt(estimate.deathsPerHour)}</dd>
          </div>
          <div className="afk__stat--exp">
            <dt>EXP</dt>
            <dd>{fmt(estimate.expPerHour)}</dd>
          </div>
          <div className="afk__stat--gold">
            <dt>Gold</dt>
            <dd>
              <span className="coin" aria-hidden="true" /> {fmt(estimate.goldPerHour)}
            </dd>
          </div>
        </dl>
        {estimate.killsPerHour === 0 && (
          <p className="expedition-dialog__warning">
            {monster.name} is too strong — your hero would not win a single fight.
          </p>
        )}

        <div className="screen__actions">
          <button
            ref={confirm}
            type="button"
            className="button button--primary"
            onClick={onSend}
            disabled={busy}
          >
            Send on expedition
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
