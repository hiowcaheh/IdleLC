import { Link } from 'react-router'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { useDevTools } from './devMode.ts'

const SPEEDS = [0.5, 1, 2, 5, 10, 20]
const LEVEL_STEPS = [-10, -1, 1, 10]

/** Testing tools (Settings → Developer tools, or ?dev=1): speed, level, any monster, kill/heal. */
export function DevPanel() {
  const open = useDevTools((s) => s.open)
  const setOpen = useDevTools((s) => s.setOpen)
  const timeScale = useGameStore((s) => s.timeScale)
  const setTimeScale = useGameStore((s) => s.setTimeScale)
  const { zoneId, monsterId } = useGameStore((s) => s.save.location)
  const selectZone = useGameStore((s) => s.selectZone)
  const level = useGameStore((s) => s.hud.playerLevel)
  const devSetLevel = useGameStore((s) => s.devSetLevel)
  const devKillTarget = useGameStore((s) => s.devKillTarget)
  const devHeal = useGameStore((s) => s.devHeal)

  if (!open) {
    return (
      <button
        type="button"
        className="dev-toggle"
        onClick={() => setOpen(true)}
        aria-label="Show developer tools"
      >
        DEV ×{timeScale} · Lv {level}
      </button>
    )
  }

  return (
    <aside className="dev-panel" aria-label="Developer tools">
      <header className="dev-panel__header">
        <p className="dev-panel__title">Dev tools</p>
        <button type="button" className="dev-chip" onClick={() => setOpen(false)}>
          Hide
        </button>
      </header>

      <div className="dev-panel__row" role="group" aria-label="Time speed">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={`dev-chip${timeScale === speed ? ' is-active' : ''}`}
            onClick={() => setTimeScale(speed)}
          >
            ×{speed}
          </button>
        ))}
      </div>

      <label className="dev-panel__field">
        Monster
        <select
          id="dev-monster"
          className="dev-chip"
          value={`${zoneId}|${monsterId}`}
          onChange={(e) => {
            const [zone, monster] = e.target.value.split('|')
            selectZone(zone!, monster)
          }}
        >
          {Object.values(ZONES).map((zone) => (
            <optgroup key={zone.id} label={`${zone.name} (${zone.monsterIds.length})`}>
              {zone.monsterIds.map((id) => {
                const m = getMonster(id)
                return (
                  <option key={id} value={`${zone.id}|${id}`}>
                    Lv {m.level} {m.name}
                    {m.elite ? ' (elite)' : ''}
                  </option>
                )
              })}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="dev-panel__row" role="group" aria-label="Player level">
        {LEVEL_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            className="dev-chip"
            onClick={() => devSetLevel(level + step)}
          >
            {step > 0 ? `+${step}` : step}
          </button>
        ))}
        <span className="dev-panel__value">Lv {level}</span>
      </div>

      <div className="dev-panel__row" role="group" aria-label="Combat">
        <button type="button" className="dev-chip" onClick={devKillTarget}>
          Kill target
        </button>
        <button type="button" className="dev-chip" onClick={devHeal}>
          Heal
        </button>
        <Link className="dev-chip dev-panel__link" to="/dev/models">
          Model viewer
        </Link>
      </div>
    </aside>
  )
}
