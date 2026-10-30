import { HEAVEN_STONE_ID } from './items.ts'

/** Kills of one monster that earn a monster book reward. */
export const BOOK_MILESTONES = [10, 100, 1000, 10000] as const

export interface BookReward {
  kills: number
  items: { itemId: number; count: number }[]
}

/** Every monster's rewards for now: Heaven Stones (owner; counts are own values). */
const DEFAULT_REWARDS = [1, 2, 5, 10].map((count) => [{ itemId: HEAVEN_STONE_ID, count }])

/** Rewards of single monsters, replacing the default ones (set by the owner later). */
const MONSTER_REWARDS: Record<string, { itemId: number; count: number }[][]> = {}

/** A monster's book rewards, one per milestone. */
export function bookRewards(monsterId: string): BookReward[] {
  const items = MONSTER_REWARDS[monsterId] ?? DEFAULT_REWARDS
  return BOOK_MILESTONES.map((kills, i) => ({ kills, items: items[i] ?? [] }))
}
