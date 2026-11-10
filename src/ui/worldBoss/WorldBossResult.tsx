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
      className="world-boss-result"
      onClose={close}
    >
      <div className="world-boss-result__heading">
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
      <table className="world-boss-result__table">
        <thead>
          <tr>
            <th scope="col">Reward</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">EXP</th>
            <td>{result.exp.toLocaleString('en-US')}</td>
          </tr>
          <tr>
            <th scope="row">Skill points</th>
            <td>{formatSp(result.sp)} SP</td>
          </tr>
          <tr>
            <th scope="row">Gold</th>
            <td>
              <Gold amount={result.gold} />
            </td>
          </tr>
          {result.drops.map((drop) => {
            const item = getItem(drop.itemId)
            return (
              <tr key={drop.itemId}>
                <th scope="row">
                  <span className="world-boss-result__item">
                    <ItemIcon item={item} size={28} />
                    <span className={nameTone({ itemId: drop.itemId })}>
                      {item.name}
                      {isRare(drop.itemId) && <small>Unidentified</small>}
                    </span>
                  </span>
                </th>
                <td>×{drop.count.toLocaleString('en-US')}</td>
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
