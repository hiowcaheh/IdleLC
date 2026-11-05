import { Gold } from './Gold.tsx'
import { useRef } from 'react'
import { useModalFocus } from './useModalFocus.ts'
import { getItem } from '../game/data/items.ts'
import { getMonster } from '../game/data/monsters.ts'
import { ZONES } from '../game/data/zones.ts'
import { AFK_MAX_SECONDS } from '../game/logic/afk.ts'
import { stacksValue } from '../game/logic/shop.ts'
import { useGameStore } from '../state/gameStore.ts'
import { duration, fmt } from './expedition/format.ts'
import { formatSp } from './skills/format.ts'
import { ItemList } from './items/ItemList.tsx'

/** "While you were away…" — what the character brought back from the expedition. */
export function AfkSummary() {
  const result = useGameStore((s) => s.afkResult)
  const dismiss = useGameStore((s) => s.dismissAfk)
  const dialog = useRef<HTMLDivElement>(null)
  useModalFocus(dialog, dismiss, result !== null)

  if (!result) return null
  const monster = getMonster(result.monsterId)
  const zone = ZONES[result.character.location.zoneId]
  const capped = result.awaySeconds > AFK_MAX_SECONDS
  const items = result.drops.map((d) => ({ ...d, item: getItem(d.itemId) }))
  const potions = result.potionsUsed.map((p) => ({ ...p, item: getItem(p.itemId) }))
  const levelAfter = result.levelBefore + result.levelsGained

  return (
    <div className="sheet-backdrop sheet-backdrop--center">
      <div
        ref={dialog}
        tabIndex={-1}
        className="sheet afk"
        role="dialog"
        aria-modal="true"
        aria-labelledby="afk-title"
      >
        <h2 id="afk-title" className="afk__title">
          While you were away…
        </h2>
        <p className="afk__subtitle">
          {result.character.name} spent {duration(result.awaySeconds)} hunting {monster.name}
          {zone ? ` in ${zone.name}` : ''}
          {capped ? `; expeditions pay up to ${duration(AFK_MAX_SECONDS)}` : ''}.
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
              <Gold amount={result.gold} prefix="+" />
            </dd>
          </div>
          <div className="afk__stat--sp">
            <dt>Skill points</dt>
            <dd>+{formatSp(result.sp)} SP</dd>
          </div>
          {(result.lost.exp > 0 || result.lost.sp > 0) && (
            <div className="afk__stat--lost">
              <dt>Lost on death</dt>
              <dd>
                −{fmt(result.lost.exp)} EXP
                {result.lost.sp > 0 ? ` · −${formatSp(result.lost.sp)} SP` : ''}
              </dd>
            </div>
          )}
        </dl>

        {result.levelsGained > 0 && (
          <p className="afk__level">
            Level {result.levelBefore} → <strong>{levelAfter}</strong>
          </p>
        )}

        <h3 className="afk__heading">
          Loot
          {result.drops.length > 0 && (
            <span className="afk__heading-meta">
              worth <Gold amount={stacksValue(result.drops)} />
            </span>
          )}
        </h3>
        {items.length ? (
          <ItemList items={items} />
        ) : (
          <p className="sheet__empty">Nothing dropped this time.</p>
        )}

        {potions.length > 0 && (
          <>
            <h3 className="afk__heading">Potions used</h3>
            <ItemList items={potions} />
          </>
        )}

        <button type="button" className="button button--primary afk__ok" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  )
}
