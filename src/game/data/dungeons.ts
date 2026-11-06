import { lcData } from './lcSource.ts'

export type DungeonId = 'belfist' | 'procyon' | 'maargadum'

export interface DungeonDef {
  id: DungeonId
  name: string
  zoneId: string
  minLevel: number
  monsterIds: readonly string[]
  color: string
}

/** Names and rosters: t_string 343/345/1201 and t_npc_regen zones 1/3/9. Levels: owner. */
export const DUNGEONS: readonly DungeonDef[] = [
  { id: 'belfist', name: 'Belfist Temple', zoneId: 'lc-zone-1', minLevel: 1, color: '#80b7b0' },
  { id: 'procyon', name: 'Procyon Shrine', zoneId: 'lc-zone-3', minLevel: 15, color: '#b19bce' },
  { id: 'maargadum', name: 'Maargadum', zoneId: 'lc-zone-9', minLevel: 30, color: '#e6a073' },
].map((d) => ({
  ...d,
  id: d.id as DungeonId,
  monsterIds: lcData?.zones.find((z) => z.id === d.zoneId)?.monsterIds ?? [
    'rust-golem',
    'stone-sentinel',
  ],
}))

export const getDungeon = (id: string): DungeonDef | undefined => DUNGEONS.find((d) => d.id === id)
export const DUNGEON_SECONDS = 600
export const DUNGEON_DAILY_RUNS = 2
export const DUNGEON_MAX_LEVEL = 20
export const DUNGEON_RADIUS = 28
export const DUNGEON_MAX_ENEMIES = 16
export const DUNGEON_WAVE_SECONDS = 30
