#!/usr/bin/env node
/**
 * Generates IdleLC game data 1:1 from the LC database dump (newproject_data.sql).
 *
 *   npm run import-lc-db -- --dump <newproject_data.sql> [--models public/assets-local/models/lc]
 *
 * Writes (git-ignored, never committed while the repo is public):
 *   src/game/data/generated/lc-data.json    monsters, field zones, drops, items, exp table
 *   src/game/data/generated/lc-models.json  model manifest for the LC GLBs that exist in --models
 *
 * The game uses them only with VITE_LC_DATA=1 (see README). See docs/lc-database.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildModelManifest, modelIdFromSmc } from './manifest.mjs'
import { int, num, readTables } from './sql.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAX_LEVEL = 99

/**
 * Field zones (t_zonedata index) with their English names. The dump has no direct link from a zone
 * to its name string, so the names come from t_string by hand (ids in comments).
 */
const FIELD_ZONES = [
  { index: 0, name: 'Juno' }, // t_string 342
  { index: 4, name: 'Dratan' }, // 346
  { index: 7, name: 'Merac' }, // 929
  { index: 15, name: 'Egeha' }, // 3050
  { index: 23, name: 'Streiana' }, // 4136
  { index: 32, name: 'Mondshine' }, // 4509 "Cappella in Mondshine"
  { index: 39, name: 'Tarian' }, // 5495
  { index: 40, name: 'Bloody-Mir' }, // 5590
  { index: 42, name: 'Alber' }, // 6259 "Alber (Trouble Spot)"
]

/** t_npc.a_flag: bit 2 = can be attacked (monsters), bit 27 = elite. */
const FLAG_ATTACKABLE = 1 << 2
const FLAG_ELITE = 1 << 27

function parseArgs(argv) {
  const args = {
    models: path.join(ROOT, 'public/assets-local/models/lc'),
    out: path.join(ROOT, 'src/game/data/generated'),
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '')
    args[key] = path.resolve(argv[++i])
  }
  if (args.dump && fs.statSync(args.dump).isDirectory())
    args.dump = path.join(args.dump, 'newproject_data.sql')
  return args
}

function buildData(tables) {
  const npcs = new Map(tables.t_npc.map((r) => [int(r.a_index), r]))
  const zoneOfNpc = new Map()
  for (const r of tables.t_npc_regen) {
    const zone = int(r.a_zone_num)
    const list = zoneOfNpc.get(int(r.a_npc_idx)) ?? new Set()
    list.add(zone)
    zoneOfNpc.set(int(r.a_npc_idx), list)
  }

  const fieldIndexes = new Set(FIELD_ZONES.map((z) => z.index))
  const monsters = []
  const usedItems = new Set()
  for (const [index, r] of npcs) {
    const flag = int(r.a_flag)
    const zones = [...(zoneOfNpc.get(index) ?? [])].filter((z) => fieldIndexes.has(z))
    const name = String(r.a_name_usa ?? '').trim()
    if (!(flag & FLAG_ATTACKABLE) || int(r.a_exp) <= 0 || zones.length === 0 || !name) continue
    if (!r.a_file_smc || /no spawn/i.test(name)) continue
    const drops = []
    for (let i = 0; i < 20; i++) {
      const item = int(r[`a_item_${i}`])
      const chance = int(r[`a_item_percent_${i}`])
      if (item > 0 && chance > 0) {
        drops.push({ item, chance: chance / 10000 })
        usedItems.add(item)
      }
    }
    monsters.push({
      id: `lc-${index}`,
      npcIndex: index,
      name,
      level: int(r.a_level),
      hp: int(r.a_hp),
      mp: int(r.a_mp),
      attack: int(r.a_attack),
      magic: int(r.a_magic),
      defense: int(r.a_defense),
      resist: int(r.a_resist),
      hit: int(r.a_hit),
      dodge: int(r.a_dodge),
      attackSpeed: int(r.a_attackSpeed),
      exp: int(r.a_exp),
      gold: int(r.a_prize),
      scale: num(r.a_scale) || 1,
      elite: (flag & FLAG_ELITE) !== 0,
      model: modelIdFromSmc(r.a_file_smc),
      smc: String(r.a_file_smc),
      animations: {
        idle: r.a_motion_idle,
        idle2: r.a_motion_idle2 !== r.a_motion_idle ? r.a_motion_idle2 || undefined : undefined,
        walk: r.a_motion_walk,
        run: r.a_motion_run,
        attack: [...new Set([r.a_motion_attack, r.a_motion_attack2].filter(Boolean))],
        hit: r.a_motion_dam,
        die: r.a_motion_die,
      },
      zones: zones.map((z) => `lc-zone-${z}`),
      drops,
    })
  }
  monsters.sort((a, b) => a.level - b.level || a.npcIndex - b.npcIndex)

  const zones = FIELD_ZONES.map((z) => {
    const list = monsters.filter((m) => m.zones.includes(`lc-zone-${z.index}`))
    return {
      id: `lc-zone-${z.index}`,
      index: z.index,
      name: z.name,
      minLevel: list.length ? Math.max(1, Math.min(...list.map((m) => m.level))) : 1,
      monsterIds: list.map((m) => m.id),
    }
  }).filter((z) => z.monsterIds.length > 0)

  const items = tables.t_item
    .filter((r) => usedItems.has(int(r.a_index)))
    .map((r) => ({
      id: int(r.a_index),
      name: String(r.a_name_usa ?? '').trim() || `Item ${r.a_index}`,
      type: int(r.a_type_idx),
      subtype: int(r.a_subtype_idx),
      slot: int(r.a_wearing),
      level: int(r.a_level),
      jobFlag: int(r.a_job_flag),
      price: int(r.a_price),
      stats: [0, 1, 2, 3, 4].map((k) => int(r[`a_num_${k}`])),
      icon: { atlas: int(r.a_texture_id), row: int(r.a_texture_row), col: int(r.a_texture_col) },
    }))

  const expTable = Array.from({ length: MAX_LEVEL }, () => 0)
  for (const r of tables.t_exp) {
    const level = int(r.a_level)
    if (level >= 1 && level <= MAX_LEVEL) expTable[level - 1] = num(r.a_exp)
  }

  return { version: 1, generatedAt: new Date().toISOString(), monsters, zones, items, expTable }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.dump || !fs.existsSync(args.dump)) {
    console.log(
      'Usage: npm run import-lc-db -- --dump <newproject_data.sql> [--models <dir with LC .glb>]',
    )
    process.exit(1)
  }
  console.log(`reading ${args.dump}`)
  const text = fs.readFileSync(args.dump, 'utf8')
  const tables = readTables(text, ['t_npc', 't_item', 't_exp', 't_npc_regen'])
  const data = buildData(tables)
  const manifest = await buildModelManifest(data, args.models)

  fs.mkdirSync(args.out, { recursive: true })
  fs.writeFileSync(path.join(args.out, 'lc-data.json'), JSON.stringify(data))
  fs.writeFileSync(path.join(args.out, 'lc-models.json'), JSON.stringify(manifest, null, 2))

  const withModel = new Set(manifest.models.map((m) => m.id))
  console.log(
    `monsters ${data.monsters.length} (${data.monsters.filter((m) => withModel.has(m.model)).length} with a converted model), ` +
      `zones ${data.zones.map((z) => `${z.name}:${z.monsterIds.length}`).join(' ')}, items ${data.items.length}, ` +
      `models ${manifest.models.map((m) => m.id).join(', ') || 'none'}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
