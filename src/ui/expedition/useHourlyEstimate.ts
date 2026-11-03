import { useEffect, useMemo, useState } from 'react'
import { estimateHourly, type HourlyEstimate } from '../../game/logic/afk.ts'
import { heroKey, type Hero } from '../../game/logic/fighters.ts'
import { createRng } from '../../game/logic/rng.ts'

/** Measured hunting rate for the preview (a fixed seed keeps the numbers steady). */
export function useHourlyEstimate(hero: Hero, monsterId: string): HourlyEstimate {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const expiry = hero.titles?.find((title) => title.id === hero.activeTitle)?.expiresAt
    if (expiry === null || expiry === undefined || expiry <= now) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(expiry - Date.now() + 1, 2_147_483_647),
    )
    return () => window.clearTimeout(timer)
  }, [hero.activeTitle, hero.titles, now])
  const key = heroKey(hero, now)
  return useMemo(
    () => estimateHourly(hero, monsterId, createRng(hero.level * 7919 + monsterId.length), now),
    // the hero object changes on every save; its key only when the estimate would
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, monsterId],
  )
}
