import { useEffect, useState } from 'react'
import { ZONES } from '../game/data/zones.ts'
import { useGameStore } from '../state/gameStore.ts'

/** Each zone's loading picture from the client (public/ui/lc/, `npm run convert-lc -- --only ui`). */
const LOADING_ART: Record<string, string> = {
  'lc-zone-0': 'loading-juno',
  'lc-zone-4': 'loading-dratan',
  'lc-zone-7': 'loading-merac',
  'lc-zone-15': 'loading-egeha',
}

/** The whole show (CSS animations in index.css), and a little more in case they never end. */
const SHOW_MS = 2600

/**
 * Going to another zone: the screen goes dark, the zone's picture comes up with its name in the
 * middle and the loading bar fills, then the new zone brightens out of the dark.
 */
export function ZoneLoading() {
  const zoneId = useGameStore((s) => s.character?.location.zoneId)
  const [seen, setSeen] = useState(zoneId)
  const [shown, setShown] = useState<{ zoneId: string; key: number } | null>(null)
  if (zoneId !== seen) {
    setSeen(zoneId)
    // a hero entering the world (no zone before) goes straight in
    if (zoneId && seen) setShown({ zoneId, key: (shown?.key ?? 0) + 1 })
  }

  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), SHOW_MS + 400)
    return () => clearTimeout(timer)
  }, [shown])

  if (!shown) return null
  const art = LOADING_ART[shown.zoneId]
  return (
    <div
      key={shown.key}
      className="zone-loading"
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setShown(null)
      }}
    >
      {art && (
        <div
          className="zone-loading__art"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}ui/lc/${art}.webp)` }}
        />
      )}
      <p className="zone-loading__name">{ZONES[shown.zoneId]?.name ?? ''}</p>
      <div className="zone-loading__bar" aria-hidden="true">
        <span className="zone-loading__fill" />
      </div>
    </div>
  )
}
