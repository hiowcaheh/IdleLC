import { useGameStore } from '../../state/gameStore.ts'

const MESSAGES: Partial<Record<string, string>> = {
  spawning: 'Szukasz przeciwnika…',
  victory: 'Zwycięstwo!',
  defeat: 'Porażka. Za chwilę wracasz do walki.',
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
