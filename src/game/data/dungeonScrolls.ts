/**
 * Dungeon reset scrolls (own items, owner's request 2026-11-07, sold in the Cash shop): one use
 * gives one more entry into its dungeon today. After 2 / 2 entries the Dungeons window shows
 * "2 / 2 (+1 extra)"; the extra run makes it 3 / 2. Extras end with the daily reset (00:00 UTC).
 */
import type { DungeonId } from './dungeons.ts'

export const DUNGEON_SCROLLS: Record<DungeonId, number> = {
  belfist: 95021,
  procyon: 95022,
  maargadum: 95023,
}

/** The dungeon a reset scroll opens again, or undefined for any other item. */
export function scrollDungeon(itemId: number): DungeonId | undefined {
  return (Object.entries(DUNGEON_SCROLLS) as [DungeonId, number][]).find(
    ([, id]) => id === itemId,
  )?.[0]
}

/** Most extra entries one dungeon can hold in a day. */
export const MAX_EXTRA_ENTRIES = 99
