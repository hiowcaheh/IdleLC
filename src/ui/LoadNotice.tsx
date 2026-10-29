import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore.ts'

const MESSAGES: Partial<Record<string, string>> = {
  migrated: 'Your save was updated to the new game version.',
  'reset-invalid': 'Your save was damaged, so you are starting over.',
  'reset-newer': 'Your save is from a newer game version, so you are starting over.',
}

/** One-time message about what happened to the save on startup. */
export function LoadNotice() {
  const status = useGameStore((s) => s.loadStatus)
  const [visible, setVisible] = useState(Boolean(status && MESSAGES[status]))
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(timer)
  }, [visible])
  if (!visible) return null
  return (
    <p className="notice" role="status">
      {status && MESSAGES[status]}
    </p>
  )
}
