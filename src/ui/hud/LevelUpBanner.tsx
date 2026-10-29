import { useEffect, useState } from 'react'
import { useGameStore } from '../../state/gameStore.ts'

const SHOW_MS = 2800

/** "Level up!" announcement in the middle of the screen. */
export function LevelUpBanner() {
  const levelUp = useGameStore((s) => s.levelUp)
  const [expiredKey, setExpiredKey] = useState<number | null>(null)

  useEffect(() => {
    if (!levelUp) return
    const timer = setTimeout(() => setExpiredKey(levelUp.key), SHOW_MS)
    return () => clearTimeout(timer)
  }, [levelUp])

  if (!levelUp || expiredKey === levelUp.key) return null
  return (
    <div key={levelUp.key} className="level-up" role="status">
      <p className="level-up__title">Level up!</p>
      <p className="level-up__level">You reached level {levelUp.level}</p>
    </div>
  )
}
