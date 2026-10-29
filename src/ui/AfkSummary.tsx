import { useEffect, useRef } from 'react'
import { getItem } from '../game/data/items.ts'
import { getMonster } from '../game/data/monsters.ts'
import { ZONES } from '../game/data/zones.ts'
import { AFK_MAX_SECONDS } from '../game/logic/afk.ts'
import { useGameStore } from '../state/gameStore.ts'
import { ItemList } from './items/ItemList.tsx'

const fmt = (n: number) => n.toLocaleString('en-US')

function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** "While you were away…" — what the character earned hunting during the time away. */
export function AfkSummary() {
  const result = useGameStore((s) => s.afkResult)
  const dismiss = useGameStore((s) => s.dismissAfk)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (result) button.current?.focus()
  }, [result])

  if (!result) return null
  const monster = getMonster(result.monsterId)
  const zone = ZONES[result.character.location.zoneId]
  const capped = result.awaySeconds > AFK_MAX_SECONDS
  const items = result.drops.map((d) => ({ ...d, item: getItem(d.itemId) }))
  const levelAfter = result.levelBefore + result.levelsGained

  return (
    <div className="sheet-backdrop sheet-backdrop--center">
      <div className="sheet afk" role="dialog" aria-modal="true" aria-labelledby="afk-title">
        <h2 id="afk-title" className="afk__title">
          While you were away…
        </h2>
        <p className="afk__subtitle">
          You were away for {duration(result.awaySeconds)}
          {capped ? ` — rewards count up to ${duration(AFK_MAX_SECONDS)}` : ''}. Your hero kept
          hunting {monster.name}
          {zone ? ` in ${zone.name}` : ''}.
        </p>

        <dl className="afk__stats">
          <div>
            <dt>Kills</dt>
            <dd>{fmt(result.kills)}</dd>
          </div>
          <div>
            <dt>Deaths</dt>
            <dd>{fmt(result.deaths)}</dd>
          </div>
          <div className="afk__stat--exp">
            <dt>EXP</dt>
            <dd>+{fmt(result.exp)}</dd>
          </div>
          <div className="afk__stat--gold">
            <dt>Gold</dt>
            <dd>
              <span className="coin" aria-hidden="true" /> +{fmt(result.gold)}
            </dd>
          </div>
        </dl>

        {result.levelsGained > 0 && (
          <p className="afk__level">
            Level {result.levelBefore} → <strong>{levelAfter}</strong>
          </p>
        )}

        <h3 className="afk__heading">Loot</h3>
        {items.length ? (
          <ItemList items={items} />
        ) : (
          <p className="sheet__empty">Nothing dropped this time.</p>
        )}

        <button
          ref={button}
          type="button"
          className="button button--primary afk__ok"
          onClick={dismiss}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
