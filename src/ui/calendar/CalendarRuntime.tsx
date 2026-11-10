import { useEffect } from 'react'
import { LOGIN_HEARTBEAT_MS } from '../../game/data/loginCalendar.ts'
import { useGameStore } from '../../state/gameStore.ts'

/** Counts foreground wall time while playing, including time spent in game windows. */
export function CalendarRuntime() {
  const characterId = useGameStore((s) => s.character?.id)
  useEffect(() => {
    if (!characterId) return
    const report = (visible: boolean) => {
      void useGameStore
        .getState()
        .calendarPresence(characterId, visible)
        .catch(() => undefined)
    }
    const sync = () => report(!document.hidden)
    sync()
    const timer = setInterval(() => {
      if (!document.hidden) report(true)
    }, LOGIN_HEARTBEAT_MS)
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
      report(false)
    }
  }, [characterId])
  return null
}
