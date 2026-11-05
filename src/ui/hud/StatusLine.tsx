import { travelSecondsLeft } from '../../game/logic/combat.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { useCombatTicker } from '../skills/useCombatTicker.ts'

const MESSAGES: Partial<Record<string, string>> = {
  traveling: 'Moving to another spot',
  victory: 'Victory!',
  defeat: 'Defeated. Back in the fight shortly.',
}

/** "1:05" or "42 s": the time a run still takes. */
function runClock(seconds: number): string {
  const whole = Math.ceil(seconds)
  if (whole < 60) return `${whole} s`
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function StatusLine() {
  const phase = useGameStore((s) => s.hud.phase)
  const message = MESSAGES[phase]
  return (
    <p className={`status-line status-line--${phase}`} aria-live="polite">
      {message ?? ''}
      {phase === 'traveling' && <RunCountdown />}
    </p>
  )
}

/** The time left of the run to another spot, at the run speed now (potions shorten it). */
function RunCountdown() {
  const state = useCombatTicker(250)
  const scale = useGameStore((s) => s.timeScale)
  const seconds = travelSecondsLeft(state) / Math.max(1, scale)
  return (
    <span className="status-line__clock" aria-label={`${Math.ceil(seconds)} seconds left`}>
      {runClock(seconds)}
    </span>
  )
}
