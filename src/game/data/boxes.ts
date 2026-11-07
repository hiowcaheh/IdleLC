/**
 * Dungeon boxes (own items, owner's request 2026-11-07): a monster killed in a dungeon may leave
 * that dungeon's box on the ground; the hero picks it up by walking into it and opens it from the
 * bag. Chances and contents are the owner's starting values ("we will tune it later").
 */
import type { DungeonId } from './dungeons.ts'
import { HEAVEN_STONE_ID, SMELTING_STONE_ID } from './items.ts'

/** The box each dungeon drops (import-db OWN_ITEMS, client chest icons). */
export const DUNGEON_BOXES: Record<DungeonId, number> = {
  belfist: 95001,
  procyon: 95002,
  maargadum: 95003,
}

/** Chance that one killed dungeon monster leaves a box. */
export const DUNGEON_BOX_CHANCE = 0.05

export interface BoxPrize {
  itemId: number
  count: number
  /** Relative weight among the box's prizes (here: per cent). */
  weight: number
}

const STONES: BoxPrize[] = [
  { itemId: SMELTING_STONE_ID, count: 1, weight: 80 },
  { itemId: HEAVEN_STONE_ID, count: 1, weight: 20 },
]

/** What a box gives when it is opened: one of its prizes, by weight. */
export const BOX_PRIZES: Readonly<Record<number, readonly BoxPrize[]>> = {
  [DUNGEON_BOXES.belfist]: STONES,
  [DUNGEON_BOXES.procyon]: STONES,
  [DUNGEON_BOXES.maargadum]: STONES,
}

export const isBox = (itemId: number): boolean => BOX_PRIZES[itemId] !== undefined
