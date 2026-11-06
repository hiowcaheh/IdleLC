import { boostsOf, type OwnedBoost } from './boosts.ts'
import type { ActiveEffect } from './combat.ts'

/** Relative potions use their remaining duration; SF_ABSTIME keeps its original deadline. */
export function dungeonPotionBoosts(
  effects: readonly ActiveEffect[],
  saved: readonly OwnedBoost[] | undefined,
  now: number,
  refreshedItem?: number,
): OwnedBoost[] {
  return boostsOf(effects, now).flatMap((boost) => {
    const previous =
      boost.itemId !== refreshedItem ? saved?.find((b) => b.itemId === boost.itemId) : undefined
    const until = previous?.until ?? boost.until
    const remaining =
      until === undefined ? boost.remaining : Math.min(boost.remaining, (until - now) / 1000)
    return remaining > 0 ? [{ ...boost, remaining, ...(until === undefined ? {} : { until }) }] : []
  })
}

/** Expired absolute potions must not get another attack or block a fresh potion after a pause. */
export function expireDungeonPotions(
  effects: readonly ActiveEffect[],
  saved: readonly OwnedBoost[] | undefined,
  now: number,
): ActiveEffect[] {
  return effects.filter(
    (e) =>
      e.dungeon ||
      e.itemId === undefined ||
      !saved?.some((b) => b.itemId === e.itemId && b.until !== undefined && b.until <= now),
  )
}
