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

const decodedArt = new Map<string, Promise<void>>()

function artUrl(art: string) {
  return `${import.meta.env.BASE_URL}ui/lc/${art}.webp`
}

/** Decode before fading in: a cached download can still need an expensive first decode. */
function prepareArt(art: string): Promise<void> {
  let ready = decodedArt.get(art)
  if (!ready) {
    const image = new Image()
    image.src = artUrl(art)
    ready = image.decode()
    decodedArt.set(art, ready)
  }
  return ready
}

/**
 * Going to another zone: the screen goes dark, the zone's picture comes up with its name in the
 * middle and the loading bar fills, then the new zone brightens out of the dark.
 */
export function ZoneLoading() {
  const zoneId = useGameStore((s) => s.character?.location.zoneId)
  const [seen, setSeen] = useState(zoneId)
  const [shown, setShown] = useState<{
    zoneId: string
    key: number
    ready: boolean
    artReady: boolean
  } | null>(null)
  if (zoneId !== seen) {
    setSeen(zoneId)
    // a hero entering the world (no zone before) goes straight in
    if (zoneId && seen)
      setShown({ zoneId, key: (shown?.key ?? 0) + 1, ready: false, artReady: false })
  }

  useEffect(() => {
    for (const art of Object.values(LOADING_ART)) void prepareArt(art).catch(() => {})
  }, [])

  useEffect(() => {
    if (!shown || shown.ready) return
    let active = true
    const finish = (artReady: boolean) => {
      if (!active) return
      active = false
      setShown((current) => (current ? { ...current, ready: true, artReady } : null))
    }
    // A missing or stalled picture must never leave the game covered indefinitely.
    const timeout = setTimeout(() => finish(false), 5000)
    const art = LOADING_ART[shown.zoneId]
    const prepared = art
      ? prepareArt(art).then(
          () => true,
          () => false,
        )
      : Promise.resolve(false)
    void prepared.then(finish)
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [shown])

  useEffect(() => {
    if (!shown?.ready) return
    const timer = setTimeout(() => setShown(null), SHOW_MS + 400)
    return () => clearTimeout(timer)
  }, [shown])

  if (!shown) return null
  const art = LOADING_ART[shown.zoneId]
  return (
    <div
      key={shown.key}
      className={`zone-loading${shown.ready ? ' zone-loading--ready' : ''}`}
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setShown(null)
      }}
    >
      {art && shown.artReady && (
        <div className="zone-loading__art" style={{ backgroundImage: `url(${artUrl(art)})` }} />
      )}
      <p className="zone-loading__name">{ZONES[shown.zoneId]?.name ?? ''}</p>
      <div className="zone-loading__bar" aria-hidden="true">
        <span className="zone-loading__fill" />
      </div>
    </div>
  )
}
