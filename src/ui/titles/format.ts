import type { CSSProperties } from 'react'
import type { TitleDef } from '../../game/data/types.ts'

/**
 * A title's text: its colour, with a glow in its second colour (t_title a_bgcolor) and a dark
 * shadow so light and dark titles both read on the scene and in windows.
 */
export function titleStyle(title: Pick<TitleDef, 'color' | 'outline' | 'effect'>): CSSProperties {
  return {
    color: title.color,
    textShadow: `0 0 3px ${title.outline}, 0 1px 2px rgba(0, 0, 0, 0.85)`,
    // the glow that pulses around a worn title over the hero (index.css .scene-label__title)
    ['--title-glow' as string]: titleEffectColor(title) ?? title.color,
  }
}

/** Colours of the client's name effects by their suffix (eff_nameSKY…): our reading of the names. */
const EFFECT_COLORS: Record<string, string> = {
  SKY: '#5ec8ff',
  GREEN: '#5aff6a',
  INDIGO: '#6f6aff',
  ORANGE: '#ff9a2e',
  PURPLE: '#b45aff',
  RVIOLET: '#ff3fa8',
  YELLOW: '#ffe14a',
  T: '#ff4a26',
  B: '#f0f0f0',
  M: '#4fb4ff',
  N: '#ffd24a',
  '': '#ffd24a',
}

/**
 * The light of a title with an effect (t_title a_effect_name): the colour its name effect says, else
 * the title's own colour; null for a title without one.
 */
export function titleEffectColor(title: Pick<TitleDef, 'color' | 'effect'>): string | null {
  if (!title.effect) return null
  const named = /^eff_name(.*)$/i.exec(title.effect)
  return (named && EFFECT_COLORS[named[1]!.toUpperCase()]) ?? title.color
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
