/**
 * Boost potions working on the hero (Potion of Haste, Platinum Adrenaline, cooldown potions): in a
 * fight they are effects of the combat state (combat.ts boostEffect); the save keeps what is left
 * of them between sessions and expeditions. Most count down while the hero plays or is away on an
 * expedition (the server's relative assist time); SF_ABSTIME ones run out by the clock.
 */
import { getItem } from '../data/items.ts'
import { boostEffect, type ActiveEffect } from './combat.ts'

/** A boost potion's effect kept in the save. */
export interface OwnedBoost {
  itemId: number
  /** Seconds of it left when it was saved. */
  remaining: number
  /** SF_ABSTIME boosts: when they run out (ms since 1970), also while the game is closed. */
  until?: number
}

const boostOf = (itemId: number) => {
  const potion = getItem(itemId).potion
  return potion?.kind === 'boost' ? potion : null
}

/** Seconds a saved boost has left at `now`. */
function secondsLeft(boost: OwnedBoost, now: number): number {
  return boost.until !== undefined ? (boost.until - now) / 1000 : boost.remaining
}

/** The saved boosts as the hero's combat effects at `now` (spent ones left out). */
export function boostEffects(
  boosts: readonly OwnedBoost[] | undefined,
  now: number,
): ActiveEffect[] {
  return (boosts ?? []).flatMap((boost) => {
    const potion = boostOf(boost.itemId)
    const left = Math.min(secondsLeft(boost, now), potion?.duration ?? 0)
    return potion && left > 0
      ? [boostEffect(boost.itemId, getItem(boost.itemId).name, potion, left)]
      : []
  })
}

/** The boosts working in a fight, to keep in the save. */
export function boostsOf(effects: readonly ActiveEffect[], now: number): OwnedBoost[] {
  return effects.flatMap((effect) => {
    const potion =
      effect.potion === 'boost' && effect.itemId !== undefined && boostOf(effect.itemId)
    if (!potion || effect.remaining <= 0) return []
    const remaining = Math.round(effect.remaining * 10) / 10
    return [
      {
        itemId: effect.itemId!,
        remaining,
        ...(potion.realTime ? { until: now + Math.round(effect.remaining * 1000) } : {}),
      },
    ]
  })
}

/**
 * The boosts a combat report may save: potions the hero had working or drank in it, never longer
 * than the potion lasts, one per item.
 */
export function reportedBoosts(
  saved: readonly OwnedBoost[] | undefined,
  drunk: readonly number[],
  reported: readonly OwnedBoost[],
  now: number,
): OwnedBoost[] {
  const allowed = new Set([...(saved ?? []).map((b) => b.itemId), ...drunk])
  const out = new Map<number, OwnedBoost>()
  for (const boost of reported) {
    const potion = boostOf(boost.itemId)
    if (!potion || !allowed.has(boost.itemId) || !(boost.remaining > 0)) continue
    const remaining = Math.min(potion.duration, boost.remaining)
    out.set(boost.itemId, {
      itemId: boost.itemId,
      remaining,
      ...(potion.realTime ? { until: now + Math.round(remaining * 1000) } : {}),
    })
  }
  return [...out.values()]
}

/** Saved boosts still running at `now`. */
export function liveBoosts(boosts: readonly OwnedBoost[] | undefined, now: number): OwnedBoost[] {
  return (boosts ?? []).filter((b) => boostOf(b.itemId) && secondsLeft(b, now) > 0)
}
