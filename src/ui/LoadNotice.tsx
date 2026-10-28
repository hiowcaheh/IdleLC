import { useEffect, useState } from 'react'
import { useGameStore } from '../state/gameStore.ts'

const MESSAGES: Partial<Record<string, string>> = {
  migrated: 'Zapis zaktualizowany do nowej wersji gry.',
  'reset-invalid': 'Zapis był uszkodzony, więc zaczynasz od nowa.',
  'reset-newer': 'Zapis pochodzi z nowszej wersji gry, więc zaczynasz od nowa.',
}

/** One-time message about what happened to the save on startup. */
export function LoadNotice() {
  const status = useGameStore((s) => s.loadStatus)
  const [visible, setVisible] = useState(Boolean(MESSAGES[status]))
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(timer)
  }, [visible])
  if (!visible) return null
  return (
    <p className="notice" role="status">
      {MESSAGES[status]}
    </p>
  )
}
