import type { ZoneDef } from './types.ts'

export const ZONES: Record<string, ZoneDef> = {
  glade: {
    id: 'glade',
    name: 'Polana Świtu',
    minLevel: 1,
    monsterIds: ['rust-golem', 'stone-sentinel'],
    environment: {
      skyTop: '#3b5a86',
      skyBottom: '#c9a77a',
      fog: '#a99a86',
      groundLow: '#3d5a2a',
      groundHigh: '#6b7a3a',
    },
  },
}

export const DEFAULT_ZONE_ID = 'glade'
