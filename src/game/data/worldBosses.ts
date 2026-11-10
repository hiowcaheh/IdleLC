import { lcData } from './lcSource.ts'
import type { LcWorldBoss } from './lcTypes.ts'

export const WORLD_BOSSES: readonly LcWorldBoss[] = lcData?.worldBosses ?? []
export const worldBossFor = (zoneId: string) => WORLD_BOSSES.find((b) => b.zoneId === zoneId)
