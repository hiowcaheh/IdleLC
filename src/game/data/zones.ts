import { lcData } from './lcSource.ts'
import type { ZoneDef } from './types.ts'

const GLADE_ENVIRONMENT: ZoneDef['environment'] = {
  skyTop: '#3b5a86',
  skyBottom: '#c9a77a',
  fog: '#a99a86',
  groundLow: '#46692b',
  groundHigh: '#7f8d43',
}

const PLACEHOLDER_ZONES: Record<string, ZoneDef> = {
  glade: {
    id: 'glade',
    name: 'Dawnlight Glade',
    minLevel: 1,
    monsterIds: ['rust-golem', 'stone-sentinel'],
    environment: GLADE_ENVIRONMENT,
  },
}

export const ZONES: Record<string, ZoneDef> = lcData
  ? Object.fromEntries(
      lcData.zones.map((z) => [
        z.id,
        {
          id: z.id,
          name: z.name,
          minLevel: z.minLevel,
          monsterIds: z.monsterIds,
          environment: GLADE_ENVIRONMENT,
        },
      ]),
    )
  : PLACEHOLDER_ZONES

export const DEFAULT_ZONE_ID = lcData ? (lcData.zones[0]?.id ?? 'glade') : 'glade'
