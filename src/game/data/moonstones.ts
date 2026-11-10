/** Normal Moonstone statue rewards from t_moonstone_reward, in the client's five-grade order. */
import { lcData } from './lcSource.ts'
import type { LcMoonstone } from './lcTypes.ts'

export const MOONSTONES: readonly LcMoonstone[] = lcData?.moonstones ?? []
export const moonstoneFor = (itemId: number) => MOONSTONES.find((s) => s.itemId === itemId)
