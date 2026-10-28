import { useGameStore } from '../../state/gameStore.ts'

const MESSAGES: Partial<Record<string, string>> = {
  spawning: 'Looking for a target…',
  victory: 'Victory!',
  defeat: 'Defeated. Back in the fight shortly.',
}

export function StatusLine() {
  const phase = useGameStore((s) => s.hud.phase)
  const message = MESSAGES[phase]
  return (
    <p className={`status-line status-line--${phase}`} aria-live="polite">
      {message ?? ''}
    </p>
  )
}
