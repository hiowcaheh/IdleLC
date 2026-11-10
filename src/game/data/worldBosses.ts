import { lcData } from './lcSource.ts'
import type { LcWorldBoss } from './lcTypes.ts'
import { CASH_TICKET_100_ID } from './cashTickets.ts'
import { MOONSTONE_BOX_ID } from './boxes.ts'

export const WORLD_BOSSES: readonly LcWorldBoss[] = lcData?.worldBosses ?? []
export const worldBossFor = (zoneId: string) => WORLD_BOSSES.find((b) => b.zoneId === zoneId)

/** Owner's 2026-11-10 changes, kept separate from the unmodified source raid table. */
export function worldBossDropTable(boss: LcWorldBoss): LcWorldBoss['raidDrops'] {
  return [
    ...boss.raidDrops
      .filter((d) => ![47, 673, 786].includes(d.item))
      .map((d) =>
        d.item === 45
          ? { ...d, item: 4917, count: 50 }
          : d.item === 485
            ? { ...d, item: 4920, count: 50 }
            : d.item === 972
              ? { ...d, count: 10 }
              : d,
      ),
    { item: MOONSTONE_BOX_ID, count: 25, probability: 10000, flag: 0 },
    { item: CASH_TICKET_100_ID, count: 1, probability: 10000, flag: 0 },
  ]
}
