#!/usr/bin/env node
/**
 * Generates IdleLC game data 1:1 from the LC database dump (newproject_data.sql).
 *
 *   npm run import-lc-db -- --dump <newproject_data.sql> [--models public/models/lc]
 *
 * Writes (committed by the owner's decision; the dump itself stays out of the repo):
 *   src/game/data/generated/lc-data.json    monsters, field zones, drops, items, exp table, shop rates
 *   src/game/data/generated/lc-models.json  model manifest for the LC GLBs that exist in --models
 *
 * The game uses them whenever they exist (see README). See docs/lc-database.md.
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

/** t_item.a_wearing slots IdleLC equips: 0 helmet, 1 armor, 2 weapon, 3 pants, 4 shield, 5 gloves, 6 boots. */
const GEAR_SLOTS = [0, 1, 2, 3, 4, 5, 6]
const WEAPON_SLOT = 2
/** t_item 84 "Smelting Stone" and 85 "Heaven Stone" (sold in Juno) upgrade weapons and armor. */
const UPGRADE_STONES = new Set([84, 85])
/** t_item.a_subtype_idx of the base classes' weapons (others are tools, Nightshadow…). */
const CLASS_WEAPONS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14])
/** t_item.a_flag of the regular weapons and armor (shops, drops, starter sets). */
const FLAG_STANDARD_ITEM = 134217758
/** a_job_flag bits of the six base classes (bit = t_skill.a_job). */
const BASE_CLASS_BITS = 0b111111

/** t_npc.a_flag: bit 2 = can be attacked (monsters), bit 27 = elite. */
const FLAG_ATTACKABLE = 1 << 2
const FLAG_ELITE = 1 << 27

function parseArgs(argv) {
  const args = {
    models: path.join(ROOT, 'public/models/lc'),
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
      // skill points for a kill, in 1/10 000 SP like the server stores them
      sp: int(r.a_skill_point),
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

  const itemRows = new Map(tables.t_item.map((r) => [int(r.a_index), r]))
  const isGear = (r) =>
    ((int(r.a_type_idx) === 0 && CLASS_WEAPONS.has(int(r.a_subtype_idx))) ||
      int(r.a_type_idx) === 1) &&
    GEAR_SLOTS.includes(int(r.a_wearing)) &&
    int(r.a_level) >= 1
  const usable = (r) => int(r.a_enable) === 1 && String(r.a_name_usa ?? '').trim() !== ''

  const starterGear = buildStarterGear(tables.t_item, isGear, usable)
  const shops = buildShops(tables, itemRows, isGear, usable)
  for (const ids of Object.values(starterGear)) ids.forEach((id) => usedItems.add(id))
  UPGRADE_STONES.forEach((id) => usedItems.add(id))
  const shopItems = new Set(Object.values(shops).flat())
  shopItems.forEach((id) => usedItems.add(id))
  const gearReference = buildGearReference(
    [...usedItems].map((id) => itemRows.get(id)).filter((r) => r && isGear(r) && usable(r)),
  )

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

  const skills = buildSkills(tables)

  // NPC shops: a_buy_rate = % of a_price the player pays, a_sell_rate = % the shop pays the player
  const mostCommon = (column) => {
    const counts = new Map()
    for (const r of tables.t_shop) counts.set(int(r[column]), (counts.get(int(r[column])) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 100
  }
  const shop = { sellRate: mostCommon('a_sell_rate'), buyRate: mostCommon('a_buy_rate') }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    monsters,
    zones,
    items,
    expTable,
    shop,
    shops,
    starterGear,
    gearReference,
    skills,
  }
}

const jobBit = (classIndex) => 1 << classIndex

/**
 * The free level-1 set each class starts with in LC (price 0, regular flag): one piece per slot;
 * of the weapons the lowest subtype (sword, staff, bow…).
 */
function buildStarterGear(itemTable, isGear, usable) {
  const starter = {}
  SKILL_CLASSES.forEach((classId, job) => {
    const bySlot = new Map()
    const candidates = itemTable
      .filter(
        (r) =>
          usable(r) &&
          isGear(r) &&
          int(r.a_level) === 1 &&
          int(r.a_price) === 0 &&
          int(r.a_flag) === FLAG_STANDARD_ITEM &&
          (int(r.a_job_flag) & jobBit(job)) !== 0,
      )
      .sort(
        (a, b) => int(a.a_subtype_idx) - int(b.a_subtype_idx) || int(a.a_index) - int(b.a_index),
      )
    for (const r of candidates) if (!bySlot.has(int(r.a_wearing))) bySlot.set(int(r.a_wearing), r)
    starter[classId] = [...bySlot.values()].map((r) => int(r.a_index))
  })
  return starter
}

/**
 * What the NPC shops of each field zone sell (t_shop.a_zone_num + t_shopitem): weapons and armor of
 * the base classes and upgrade stones. Keyed by IdleLC zone id.
 */
function buildShops(tables, itemRows, isGear, usable) {
  const fieldZones = new Map(FIELD_ZONES.map((z) => [z.index, `lc-zone-${z.index}`]))
  const zoneOfKeeper = new Map(tables.t_shop.map((r) => [int(r.a_keeper_idx), int(r.a_zone_num)]))
  const shops = {}
  for (const r of tables.t_shopitem) {
    const zoneId = fieldZones.get(zoneOfKeeper.get(int(r.a_keeper_idx)))
    const item = itemRows.get(int(r.a_item_idx))
    if (!zoneId || !item || !usable(item) || int(item.a_price) <= 0) continue
    const gear = isGear(item) && (int(item.a_job_flag) & BASE_CLASS_BITS) !== 0
    if (!gear && !UPGRADE_STONES.has(int(item.a_index))) continue
    ;(shops[zoneId] ??= new Set()).add(int(item.a_index))
  }
  return Object.fromEntries(
    Object.entries(shops).map(([zoneId, ids]) => [
      zoneId,
      [...ids].sort(
        (a, b) =>
          int(itemRows.get(a).a_level) - int(itemRows.get(b).a_level) ||
          int(itemRows.get(a).a_wearing) - int(itemRows.get(b).a_wearing) ||
          a - b,
      ),
    ]),
  )
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Typical gear of a class at every level 1…99: per slot, the median power (a_num_0 + a_num_1) of the
 * newest tier of obtainable pieces (drops, shops, starter set) the class can wear at that level —
 * its main line: the pieces with the tier's most common price (premium sets cost more).
 * `weapon[L - 1]` = the weapon slot, `armor[L - 1]` = the armor slots added up. IdleLC measures the
 * equipped gear against it (src/game/logic/equipment.ts).
 */
function buildGearReference(pool) {
  const power = (r) => int(r.a_num_0) + int(r.a_num_1)
  const reference = {}
  SKILL_CLASSES.forEach((classId, job) => {
    const own = pool.filter((r) => (int(r.a_job_flag) & jobBit(job)) !== 0)
    const tierPower = (slot, level) => {
      const fits = own.filter((r) => int(r.a_wearing) === slot && int(r.a_level) <= level)
      if (fits.length === 0) return 0
      const tier = Math.max(...fits.map((r) => int(r.a_level)))
      const pieces = fits.filter((r) => int(r.a_level) === tier)
      const prices = new Map()
      for (const r of pieces) prices.set(int(r.a_price), (prices.get(int(r.a_price)) ?? 0) + 1)
      const [mainPrice] = [...prices].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
      return median(pieces.filter((r) => int(r.a_price) === mainPrice).map(power))
    }
    const weapon = []
    const armor = []
    for (let level = 1; level <= MAX_LEVEL; level++) {
      weapon.push(tierPower(WEAPON_SLOT, level))
      armor.push(
        GEAR_SLOTS.filter((s) => s !== WEAPON_SLOT).reduce(
          (sum, s) => sum + tierPower(s, level),
          0,
        ),
      )
    }
    reference[classId] = { weapon, armor }
  })
  return reference
}

/** t_skill.a_job → IdleLC class (base classes only; a_job2 = 0 are the skills before a subclass). */
const SKILL_CLASSES = ['titan', 'knight', 'healer', 'mage', 'rogue', 'sorcerer']

/**
 * Class skills 1:1: t_skill (name, description, type, timings in 1/10 s, icon) with every level from
 * t_skilllevel (mana, learn level, SP, duration, prerequisites) and its effects from t_magic /
 * t_magiclevel (type, subtype, damage type, power). How the game uses them: src/game/logic/skills.ts.
 */
function buildSkills(tables) {
  const magics = new Map(tables.t_magic.map((r) => [int(r.a_index), r]))
  const magicPower = new Map(
    tables.t_magiclevel.map((r) => [`${int(r.a_index)}/${int(r.a_level)}`, r]),
  )
  const levelsOf = new Map()
  for (const r of tables.t_skilllevel) {
    const list = levelsOf.get(int(r.a_index)) ?? []
    list.push(r)
    levelsOf.set(int(r.a_index), list)
  }

  const skills = []
  for (const r of tables.t_skill) {
    const job = int(r.a_job)
    const name = String(r.a_name_usa ?? '').trim()
    if (job < 0 || job >= SKILL_CLASSES.length || int(r.a_job2) !== 0 || !name) continue
    const rows = (levelsOf.get(int(r.a_index)) ?? []).sort(
      (a, b) => int(a.a_level) - int(b.a_level),
    )
    if (rows.length === 0 || int(rows[0].a_learnLevel) > MAX_LEVEL) continue
    const levels = rows.map((l) => {
      const effects = []
      for (let k = 1; k <= 3; k++) {
        const magic = magics.get(int(l[`a_magicIndex${k}`]))
        if (!magic) continue
        const power = magicPower.get(`${int(magic.a_index)}/${int(l[`a_magicLevel${k}`])}`)
        effects.push({
          magic: int(magic.a_index),
          type: int(magic.a_type),
          subtype: int(magic.a_subtype),
          damageType: int(magic.a_damagetype),
          power: power ? int(power.a_power) : 0,
        })
      }
      const requires = []
      for (let k = 1; k <= 3; k++) {
        const skill = int(l[`a_learnSkillIndex${k}`])
        if (skill > 0) requires.push({ skill, level: int(l[`a_learnSkillLevel${k}`]) })
      }
      return {
        level: int(l.a_level),
        mp: int(l.a_needMP),
        hp: int(l.a_needHP),
        duration: int(l.a_durtime),
        learnLevel: int(l.a_learnLevel),
        learnSp: int(l.a_learnSP),
        requires,
        effects,
      }
    })
    skills.push({
      id: int(r.a_index),
      classId: SKILL_CLASSES[job],
      name,
      description: String(r.a_client_description_usa ?? '').trim(),
      type: int(r.a_type),
      targetType: int(r.a_targetType),
      readyTime: int(r.a_readyTime),
      fireTime: int(r.a_fireTime),
      reuseTime: int(r.a_reuseTime),
      icon: {
        atlas: int(r.a_client_icon_texid),
        row: int(r.a_client_icon_row),
        col: int(r.a_client_icon_col),
      },
      levels,
    })
  }
  return skills.sort((a, b) => a.levels[0].learnLevel - b.levels[0].learnLevel || a.id - b.id)
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
  const tables = readTables(text, [
    't_npc',
    't_item',
    't_exp',
    't_npc_regen',
    't_shop',
    't_shopitem',
    't_skill',
    't_skilllevel',
    't_magic',
    't_magiclevel',
  ])
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
