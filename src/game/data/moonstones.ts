/** Normal Moonstone statue rewards from t_moonstone_reward, in the client's five-grade order. */
import { lcData } from './lcSource.ts'
import type { LcMoonstone } from './lcTypes.ts'

// Owner: Gold Tokens are sold only in the ItemShop. Keep the source weight/count, award Token.
export const MOONSTONES: readonly LcMoonstone[] = (lcData?.moonstones ?? []).map((stone) => ({
  ...stone,
  rewards: stone.rewards.map((prize) =>
    prize.itemId === 5124 ? { ...prize, itemId: 5123 } : prize,
  ),
}))
export const moonstoneFor = (itemId: number) => MOONSTONES.find((s) => s.itemId === itemId)
