/**
 * Entering a dungeon (owner's request, 2026-11-07): the dungeon's loading picture fills the screen
 * with its name, "Loading dungeon" and the client's bar, like going to another zone (ZoneLoading).
 * The run waits behind it (dungeonSession.loading) until the arena is up and the bar is full.
 */
import { useEffect, useState } from 'react'
import { getDungeon, type DungeonId } from '../../game/data/dungeons.ts'
import { dungeonSession } from '../../game/session/dungeonSession.ts'
import { useGameStore } from '../../state/gameStore.ts'

/** Keep in step with the zone loading bar's animation (2.6 s). */
const MIN_SHOW_MS = 2600
/** Never keep the game covered: a scene that fails to come up still lets the player in. */
const MAX_SHOW_MS = 12_000
export const DUNGEON_ART_VERSION = 2

export function DungeonLoading() {
  const id = useGameStore((s) => s.dungeonLoading)
  // a new entry is a new screen: its state starts over
  return id ? <Loading key={id} id={id} /> : null
}

function Loading({ id }: { id: DungeonId }) {
  const loaded = useGameStore((s) => s.dungeonLoaded)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const started = performance.now()
    const timer = setInterval(() => {
      const elapsed = performance.now() - started
      const up = !!useGameStore.getState().dungeon && dungeonSession.ready
      if ((elapsed >= MIN_SHOW_MS && up) || elapsed >= MAX_SHOW_MS) {
        clearInterval(timer)
        setLeaving(true)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!leaving) return
    // also when animation events are suppressed (background tab, reduced motion)
    const timer = setTimeout(loaded, 500)
    return () => clearTimeout(timer)
  }, [leaving, loaded])

  const dungeon = getDungeon(id)
  return (
    <div
      className={`zone-loading zone-loading--ready dungeon-loading${leaving ? ' zone-loading--leaving' : ''}`}
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && leaving) loaded()
      }}
    >
      <div
        className="zone-loading__art"
        aria-hidden="true"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}dungeons/${id}/loading.webp?v=${DUNGEON_ART_VERSION})`,
        }}
      />
      <p className="zone-loading__name" style={{ color: dungeon?.color }}>
        {dungeon?.name ?? ''}
      </p>
      <p className="dungeon-loading__text">Loading dungeon…</p>
      <div className="zone-loading__bar" aria-hidden="true">
        <span className="zone-loading__fill" />
      </div>
    </div>
  )
}
