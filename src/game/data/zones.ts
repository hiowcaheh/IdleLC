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
    bossIds: [],
    environment: GLADE_ENVIRONMENT,
  },
}

/** Event monsters every zone of the database holds (Triangle ball, Pumpkin, Giant Pumpkin Head). */
export const EVENT_MONSTERS: ReadonlySet<string> = new Set(['lc-1105', 'lc-454', 'lc-1633'])

/**
 * Raid bosses (owner's decision 2026-10-30): no hunting spot; they wait for a boss system. Grand
 * Balrog (Juno), Baal (Dratan), Grand Red Dragon and Gatekeeper Abaddon (Merac), Grand Golden
 * Dragon (Egeha), the Shadow Dragons (Streiana), Brainwashed Balrog (Alber).
 */
export const RAID_BOSSES: ReadonlySet<string> = new Set([
  'lc-308',
  'lc-152',
  'lc-309',
  'lc-1339',
  'lc-331',
  'lc-504',
  'lc-505',
  'lc-1553',
])

const lcMonsters = new Map((lcData?.monsters ?? []).map((m) => [m.id, m]))
/**
 * Spots in hunting order: by level; at the same level plain monsters before elite ones, then weaker
 * (HP, attack) before stronger, then the database's order.
 */
function huntingOrder(ids: string[]): string[] {
  const key = (id: string) => {
    const m = lcMonsters.get(id)
    return m ? [m.level, m.elite ? 1 : 0, m.hp, m.attack] : [0]
  }
  return ids
    .map((id, i) => ({ id, i, key: key(id) }))
    .sort((a, b) => {
      for (let k = 0; k < Math.max(a.key.length, b.key.length); k++) {
        const d = (a.key[k] ?? 0) - (b.key[k] ?? 0)
        if (d !== 0) return d
      }
      return a.i - b.i
    })
    .map((x) => x.id)
}

export const ZONES: Record<string, ZoneDef> = lcData
  ? Object.fromEntries(
      lcData.zones.map((z) => [
        z.id,
        {
          id: z.id,
          name: z.name,
          minLevel: z.minLevel,
          monsterIds: huntingOrder(
            z.monsterIds.filter((id) => !EVENT_MONSTERS.has(id) && !RAID_BOSSES.has(id)),
          ),
          bossIds: z.monsterIds.filter((id) => RAID_BOSSES.has(id)),
          environment: GLADE_ENVIRONMENT,
        },
      ]),
    )
  : PLACEHOLDER_ZONES

export const DEFAULT_ZONE_ID = lcData ? (lcData.zones[0]?.id ?? 'glade') : 'glade'
