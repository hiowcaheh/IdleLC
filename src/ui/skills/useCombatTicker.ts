import { useEffect, useState } from 'react'
import type { CombatState } from '../../game/logic/combat.ts'
import { combatSession } from '../../game/session/combatSession.ts'

/** The fight on screen, re-read every `ms` (cooldowns and buffs change every frame). */
export function useCombatTicker(ms = 150): CombatState {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(timer)
  }, [ms])
  return combatSession.state
}
