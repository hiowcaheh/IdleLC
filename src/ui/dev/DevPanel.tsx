import { Link } from 'react-router'
import { ZONES } from '../../game/data/zones.ts'
import { useGameStore } from '../../state/gameStore.ts'

const SPEEDS = [0.25, 1, 2, 5, 10]
const LEVEL_STEPS = [-10, -1, 1, 10]

/** Visible only with ?dev=1: time speed, zone and player level, link to the model viewer. */
export function DevPanel() {
  const timeScale = useGameStore((s) => s.timeScale)
  const setTimeScale = useGameStore((s) => s.setTimeScale)
  const zoneId = useGameStore((s) => s.save.location.zoneId)
  const selectZone = useGameStore((s) => s.selectZone)
  const level = useGameStore((s) => s.hud.playerLevel)
  const setPlayerLevel = useGameStore((s) => s.setPlayerLevel)
  const zones = Object.values(ZONES)

  return (
    <aside className="dev-panel" aria-label="Developer tools">
      <p className="dev-panel__title">Dev mode</p>
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
      {zones.length > 1 && (
        <label className="dev-panel__row">
          Zone
          <select
            id="dev-zone"
            className="dev-chip"
            value={zoneId}
            onChange={(e) => selectZone(e.target.value)}
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name} ({z.monsterIds.length})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="dev-panel__row" role="group" aria-label="Player level">
        {LEVEL_STEPS.map((step) => (
          <button
            key={step}
            type="button"
            className="dev-chip"
            onClick={() => setPlayerLevel(level + step)}
          >
            {step > 0 ? `+${step}` : step}
          </button>
        ))}
        <span className="dev-panel__value">Lv {level}</span>
      </div>
      <Link className="dev-panel__link" to="/dev/models">
        Model & animation viewer
      </Link>
    </aside>
  )
}
