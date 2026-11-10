/** CUIGamble's five normal Moonstones; Server.cpp loads t_moonstone_reward by gift index. */
import { int, num } from './sql.mjs'

export const MOONSTONE_IDS = [2545, 2546, 723, 2547, 2548]

export function buildMoonstoneRewards(tables) {
  if (!tables.t_moonstone_reward) return []
  return MOONSTONE_IDS.map((itemId) => {
    const rewards = tables.t_moonstone_reward
      .filter((row) => int(row.a_type) === itemId)
      .sort((a, b) => int(a.a_giftindex) - int(b.a_giftindex))
      .map((row) => ({
        itemId: int(row.a_giftindex),
        count: int(row.a_giftcount),
        // CDBCmd reads float; C++ promotes that float before multiplying by 10000.0.
        weight: Math.trunc(Math.fround(num(row.a_giftprob)) * 10000),
        flag: int(row.a_giftflag),
      }))
    if (
      !rewards.length ||
      rewards.some((r) => r.itemId < 1 || r.count < 1 || r.weight < 1 || r.flag < 0)
    )
      throw new Error(`Invalid Moonstone rewards for ${itemId}`)
    if (new Set(rewards.map((r) => r.itemId)).size !== rewards.length)
      throw new Error(`Duplicate Moonstone reward for ${itemId}`)
    return { itemId, rewards }
  })
}
