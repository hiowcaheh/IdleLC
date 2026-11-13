import { useEffect, useState } from 'react'
import { estimateHourly, type HourlyEstimate } from '../../game/logic/afk.ts'
import { heroKey, type Hero } from '../../game/logic/fighters.ts'
import { createRng } from '../../game/logic/rng.ts'

/**
 * Measured hunting rate for the preview (a fixed seed keeps the numbers steady), or null while it
 * is measured. It runs after the window is drawn, so opening it never waits on the measurement,
 * and again only when the hero changes in a way the estimate sees: boosts count by the minute,
 * not by every second they tick down (owner: the Expedition window froze and scrolled badly).
 */
export function useHourlyEstimate(hero: Hero, monsterId: string): HourlyEstimate | null {
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
  const boosts = (hero.boosts ?? [])
    .map((b) => `${b.itemId}:${Math.ceil(b.remaining / 60)}`)
    .join(',')
  const key = `${heroKey(hero, now)}|${boosts}|${monsterId}`
  const [measured, setMeasured] = useState<{ key: string; estimate: HourlyEstimate } | null>(null)
  useEffect(() => {
    if (measured?.key === key) return
    // after the frame that draws the window
    const timer = window.setTimeout(() => {
      const estimate = estimateHourly(
        hero,
        monsterId,
        createRng(hero.level * 7919 + monsterId.length),
        now,
      )
      setMeasured({ key, estimate })
    }, 30)
    return () => window.clearTimeout(timer)
    // the hero object changes on every save; its key only when the estimate would
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  // the last estimate stays shown while a changed hero is measured again
  return measured?.estimate ?? null
}
