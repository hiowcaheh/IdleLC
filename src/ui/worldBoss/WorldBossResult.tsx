import { getItem } from '../../game/data/items.ts'
import { getMonster } from '../../game/data/monsters.ts'
import { isRare } from '../../game/logic/rare.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { Gold } from '../Gold.tsx'
import { Sheet } from '../Sheet.tsx'
import { nameTone } from '../gear/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { formatSp } from '../skills/format.ts'
import { worldBossTime } from './format.ts'

export function WorldBossTimer() {
  const active = useGameStore((s) => s.character?.worldBoss?.active)
  const ms = useGameStore((s) => s.hud.worldBossMs)
  if (!active || ms === null) return null
  return (
    <div className="world-boss-timer" role="timer" aria-label="World Boss fight time">
      <span>World Boss</span>
      <strong>{worldBossTime(ms)}</strong>
    </div>
  )
}

export function WorldBossResult() {
  const result = useGameStore((s) => s.worldBossResult)
  const dismiss = useGameStore((s) => s.dismissWorldBossResult)
  const busy = useGameStore((s) => s.worldBossEntering)
  if (!result) return null
  const close = () => {
    if (!busy) void dismiss().catch(() => toast('Could not resume the field. Try again.', 'error'))
  }
  return (
    <Sheet
      title="World Boss defeated"
      titleId="world-boss-result-title"
      centered
      className="world-boss-result sheet--client"
      onClose={close}
    >
      <div className="world-boss-result__heading">
        <span className="world-boss-result__portrait" aria-hidden="true">
          <img
            alt=""
            src={`${import.meta.env.BASE_URL}ui/world-boss/${getMonster(result.record.monsterId).modelId}.webp?v=1`}
          />
        </span>
        <div>
          <h3>{getMonster(result.record.monsterId).name}</h3>
          <p>
            Fight time{' '}
            <strong>
              {result.record.combatMs === null
                ? 'Not started'
                : worldBossTime(result.record.combatMs)}
            </strong>
          </p>
          {result.record.assisted && <small>DEV test</small>}
        </div>
      </div>
      <table className="world-boss-result__table">
        <caption>Loot</caption>
        <thead>
          <tr>
            <th scope="col">Reward</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">EXP</th>
            <td>
              <span className="world-boss-result__amount">
                {result.exp.toLocaleString('en-US')}
              </span>
            </td>
          </tr>
          <tr>
            <th scope="row">Skill points</th>
            <td>
              <span className="world-boss-result__amount">{formatSp(result.sp)} SP</span>
            </td>
          </tr>
          <tr>
            <th scope="row">Gold</th>
            <td>
              <span className="world-boss-result__amount">
                <Gold amount={result.gold} />
              </span>
            </td>
          </tr>
          {result.drops.map((drop) => {
            const item = getItem(drop.itemId)
            return (
              <tr key={drop.itemId}>
                <th scope="row">
                  <span className="world-boss-result__item">
                    <span className="world-boss-result__slot">
                      <ItemIcon item={item} size={28} />
                    </span>
                    <span className={nameTone({ itemId: drop.itemId })}>
                      {item.name}
                      {isRare(drop.itemId) && <small>Unidentified</small>}
                    </span>
                  </span>
                </th>
                <td>
                  <span className="world-boss-result__amount">
                    ×{drop.count.toLocaleString('en-US')}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="sheet__meta">Rewards have been added to your inventory.</p>
      <button
        type="button"
        className="button button--primary world-boss-result__continue"
        disabled={busy}
        onClick={close}
      >
        Continue
      </button>
    </Sheet>
  )
}
