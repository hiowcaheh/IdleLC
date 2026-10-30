import type { CSSProperties } from 'react'
import type { TitleDef } from '../../game/data/types.ts'

/**
 * A title's text: its colour, with a glow in its second colour (t_title a_bgcolor) and a dark
 * shadow so light and dark titles both read on the scene and in windows.
 */
export function titleStyle(title: Pick<TitleDef, 'color' | 'outline'>): CSSProperties {
  return {
    color: title.color,
    textShadow: `0 0 3px ${title.outline}, 0 1px 2px rgba(0, 0, 0, 0.85)`,
  }
}

/** "7 days", "1 day", "Permanent". */
export function titleDuration(days: number | null): string {
  if (days === null) return 'Permanent'
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** Time a title has left: "Permanent", "6d 23h", "5h 12m", "40m". */
export function titleTimeLeft(expiresAt: number | null, now: number): string {
  if (expiresAt === null) return 'Permanent'
  const minutes = Math.max(0, Math.floor((expiresAt - now) / 60000))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${Math.max(1, minutes)}m`
}
