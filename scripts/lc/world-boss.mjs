/** World Boss selection/progress is IdleLC's rule; raid rows are the server's t_npc_dropraid. */
import { int } from './sql.mjs'

export const WORLD_BOSS_NPCS = [
  { npc: 308, zone: 0, kills: 2000 },
  { npc: 307, zone: 4, kills: 1800 },
  { npc: 309, zone: 7, kills: 1600 },
  { npc: 331, zone: 15, kills: 1500 },
]

/** NPCProto.cpp orders by item index; hardcoding.cpp rolls each row independently in 1..10000. */
export function buildWorldBosses(tables) {
  return WORLD_BOSS_NPCS.map(({ npc, zone, kills }) => {
    const raidDrops = (tables.t_npc_dropraid ?? [])
      .filter((r) => int(r.a_npc_index) === npc)
      .sort((a, b) => int(a.a_item_index) - int(b.a_item_index))
      .map((r) => ({
        item: int(r.a_item_index),
        count: int(r.a_count),
        probability: int(r.a_prob),
        flag: int(r.a_flag),
      }))
    if (!raidDrops.length) throw new Error(`Missing t_npc_dropraid for World Boss ${npc}`)
    if (
      raidDrops.some(
        (r) =>
          r.item <= 0 || r.count <= 0 || r.probability < 0 || r.probability > 10000 || r.flag !== 0,
      )
    )
      throw new Error(`Unsupported World Boss raid drop ${npc}`)
    return { zoneId: `lc-zone-${zone}`, monsterId: `lc-${npc}`, killsRequired: kills, raidDrops }
  })
}
