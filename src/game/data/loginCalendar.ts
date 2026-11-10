/** Owner's daily-login rewards, drawn from items already used in IdleLC. */
import type { ItemStack } from '../logic/loot.ts'

export const LOGIN_ONLINE_MS = 10 * 60 * 1000
export const LOGIN_HEARTBEAT_MS = 5000
export const LOGIN_MAX_GAP_MS = 15000
export type CalendarTrack = 'weekly' | 'monthly'

const reward = (itemId: number, count: number): ItemStack => ({ itemId, count })
/** Monday through Sunday. */
export const WEEKLY_LOGIN_REWARDS: readonly ItemStack[] = [
  reward(2544, 5),
  reward(85, 3),
  reward(972, 3),
  reward(1288, 2),
  reward(2453, 2),
  reward(2547, 3),
  reward(2548, 2),
]
export const MONTHLY_LOGIN_REWARDS: readonly ItemStack[] = [
  reward(2544, 3),
  reward(85, 2),
  reward(1839, 2),
  reward(972, 2),
  reward(1288, 1),
  reward(2453, 1),
  reward(95011, 1),
  reward(2547, 2),
  reward(2544, 5),
  reward(4917, 50),
  reward(4920, 50),
  reward(85, 3),
  reward(2845, 1),
  reward(95012, 1),
  reward(2547, 3),
  reward(1839, 3),
  reward(1288, 2),
  reward(2453, 2),
  reward(972, 3),
  reward(2544, 7),
  reward(95013, 1),
  reward(2547, 4),
  reward(85, 5),
  reward(1839, 5),
  reward(2548, 1),
  reward(1288, 3),
  reward(2453, 3),
  reward(2548, 3),
  reward(2547, 5),
  reward(95013, 1),
  reward(95014, 1),
]

export function loginReward(track: CalendarTrack, date: Date): ItemStack {
  if (track === 'weekly') return { ...WEEKLY_LOGIN_REWARDS[(date.getUTCDay() + 6) % 7]! }
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  return date.getUTCDate() === lastDay
    ? reward(95014, 1)
    : { ...MONTHLY_LOGIN_REWARDS[date.getUTCDate() - 1]! }
}
