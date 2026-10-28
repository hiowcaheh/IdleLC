import { Link } from 'react-router'
import { useGameStore } from '../../state/gameStore.ts'

const SPEEDS = [0.25, 1, 2, 5, 10]

/** Visible only with ?dev=1. Speeds up time and links to the model/animation viewer. */
export function DevPanel() {
  const timeScale = useGameStore((s) => s.timeScale)
  const setTimeScale = useGameStore((s) => s.setTimeScale)
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
      <Link className="dev-panel__link" to="/dev/models">
        Model & animation viewer
      </Link>
    </aside>
  )
}
