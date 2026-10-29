import { useMemo } from 'react'
import { estimateHourly, type HourlyEstimate } from '../../game/logic/afk.ts'
import { heroKey, type Hero } from '../../game/logic/fighters.ts'
import { createRng } from '../../game/logic/rng.ts'

/** Measured hunting rate for the preview (a fixed seed keeps the numbers steady). */
export function useHourlyEstimate(hero: Hero, monsterId: string): HourlyEstimate {
  const key = heroKey(hero)
  return useMemo(
    () => estimateHourly(hero, monsterId, createRng(hero.level * 7919 + monsterId.length)),
    // the hero object changes on every save; its key only when the estimate would
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, monsterId],
  )
}
