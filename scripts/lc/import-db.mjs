#!/usr/bin/env node
/**
 * Generates IdleLC game data 1:1 from the LC database dump (newproject_data.sql).
 *
 *   npm run import-lc-db -- --dump <newproject_data.sql> [--models public/models/lc]
 *
 * Writes (committed by the owner's decision; the dump itself stays out of the repo):
 *   src/game/data/generated/lc-data.json    monsters, field zones, drops, items, exp table, shop rates
 *   src/game/data/generated/lc-models.json  model manifest for the LC GLBs that exist in --models
 *   src/game/data/generated/lc-item-models.json  gear .smc → item ids, for `npm run convert-lc`
 *
 * The game uses them whenever they exist (see README). See docs/lc-database.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildModelManifest, modelIdFromSmc } from './manifest.mjs'
import { int, num, readTables } from './sql.mjs'
import { sourceFields, sourceMagic, sourceNpc } from './source-records.mjs'
import { buildDungeonSuperBuffs, DUNGEON_SUPER_ITEMS } from './dungeon-super.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MAX_LEVEL = 100

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

/** Original dungeon rosters (t_string 343 / 345 / 1201); entry levels are IdleLC rules. */
const DUNGEON_ZONES = [
  { index: 1, name: 'Belfist Temple' },
  { index: 3, name: 'Procyon Shrine' },
  { index: 9, name: 'Maargadum' },
]

/** t_item.a_wearing slots IdleLC equips: 0 helmet, 1 armor, 2 weapon, 3 pants, 4 shield, 5 gloves, 6 boots. */
const GEAR_SLOTS = [0, 1, 2, 3, 4, 5, 6]
const WEAPON_SLOT = 2
/** t_item 84 "Smelting Stone" and 85 "Heaven Stone" (sold in Juno) upgrade weapons and armor. */
const UPGRADE_STONES = new Set([84, 85])
/**
 * Potions that lend a timed boost (owner's request, 2026-11-05): 391 "Potion of Haste" (skill 70,
 * run speed; sold in the towns), 2138 "Platinum Adrenaline" (skill 429, attack and run speed; sold
 * in Juno) and 6916 "100 Cooldown Reduction Potion" (skill 1340 level 5, STAT37 skill cool time;
 * the database has no skill cast speed potion). Their effects, durations and flags come from
 * t_skill / t_skillLevel / t_magic.
 */
const BOOST_POTIONS = new Set([
  391, 2138, 2845, 6916,
  // the owner's list of 2026-11-07 (cash shop and event potions), as t_item / t_skill run them:
  // HP / MP steal, Berserker, Power, Strength, Dex, Constitution, Intelligence, Shield, Magic
  // Shield, three critical potions, Large Attack / Defense, chocolates, Candle, Red Lucky Pouch,
  // Blessed Iris and the Platinum Super Skill Pill
  2357, 2356, 2853, 2846, 2849, 2850, 2851, 2852, 2872, 2871, 2988, 2989, 2990, 1315, 1314, 2043,
  2044, 2045, 1226, 1227, 1575, 2631, 1288, 2453,
])
/**
 * Boosts the server runs by their item or skill index instead of their t_magic (CAssistList::Apply,
 * Assist.cpp: `bSkip`, the magic is not applied). steal: Battle.cpp hcHPSteelPotion (30% of the
 * hits that hurt give back 5% of the damage) / hcMPSteelPotion (30%: 10% of max MP). berserker:
 * Battle_GetDamage.cpp hcAttackBerserker (10% of the hero's hits on a monster deal double). exp:
 * skill 349 rate hcCashExpUp = its magic power; sp: item 2453 hcSPPlusPer100 += 200.
 */
const HARDCODED_BOOSTS = new Map([
  [2357, { steal: 'hp' }],
  [2356, { steal: 'mp' }],
  [2853, { berserker: true }],
  [1288, { rewards: 'exp' }],
  [2453, { rewards: 'sp' }],
])
/**
 * IdleLC prices of items the database gives no gold price (own, owner's request 2026-11-05): the
 * cooldown potion is a cash shop item there.
 */
const OWN_PRICES = new Map([
  [2845, 50_000],
  [6916, 50_000],
])
/**
 * Boost potions that work by the owner's rule instead of the server's formula (own, 2026-11-05):
 * the 100 Cooldown Reduction Potion takes skill cooldowns to nothing. Its STAT37 power 100 would
 * only make them ×150/250 × 100/200 = 0.3 as long (Skill.cpp).
 */
const NO_COOLDOWN_POTIONS = new Set([6916])
/** t_skill.a_flag bits a boost potion keeps (Skill.h): kept at death, real time, not twice. */
const SF_ABSTIME = 1 << 3
const SF_NOTDUPLICATE = 1 << 4
const SF_NOCANCEL = 1 << 5
/**
 * IdleLC's own items (not in the database), with client icons (owner's request, 2026-11-07): the
 * chests a dungeon's monsters drop. Their contents are game rules (src/game/data/boxes.ts). Ids
 * from 95001 stay clear of every t_item index.
 */
export const OWN_ITEMS = [
  { id: 95001, name: 'Belfist Box', icon: { atlas: 7, row: 3, col: 6 } },
  { id: 95002, name: 'Procyon Box', icon: { atlas: 7, row: 3, col: 3 } },
  { id: 95003, name: 'Maargadum Box', icon: { atlas: 7, row: 3, col: 7 } },
].map((item) => ({
  ...item,
  // t_item a_type_idx 2 / a_subtype_idx 9: the client's boxes opened for a random reward
  type: 2,
  subtype: 9,
  slot: -1,
  level: 0,
  jobFlag: 0,
  flag: 0,
  price: 0,
  stats: [0, 0, 0, 0, 0],
  own: true,
}))
/**
 * t_item 1838 "Magnifying glass" (may fail) and 1839 "Golden magnifying glass" (always works) identify
 * rare items. LC sells them in town shops; IdleLC's shop offers them in every zone (own decision).
 */
const MAGNIFIERS = [1838, 1839]
/** t_item.a_subtype_idx of the base classes' weapons (others are tools, Nightshadow…). */
const CLASS_WEAPONS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14])
/** t_item.a_flag of the regular weapons and armor (shops, drops, starter sets). */
const FLAG_STANDARD_ITEM = 134217758
/** t_item.a_flag bits: 2 = can be upgraded, 27 = set on all regular gear, 28 = cash shop items. */
const FLAG_UPGRADE = 1 << 2
const FLAG_REGULAR = 1 << 27
const FLAG_CASH = 1 << 28
const isRegularGear = (flag) =>
  (flag & FLAG_UPGRADE) !== 0 && (flag & FLAG_REGULAR) !== 0 && (flag & FLAG_CASH) === 0
/**
 * Region placeholders cost 1 gold; real gear costs hundreds and more. The level-50 Phoenix event gear
 * costs a token 100 gold: it stays out of the shop (owner's decision).
 */
const MIN_SHOP_PRICE = 101
const EVENT_GEAR_PRICE = 100
/** t_item.a_flag of the plain "Magical Accessory" pieces (cords, stones, eyes, earrings, rings). */
const FLAG_MAGIC_ACCESSORY = 134217754
/** t_skill.a_useState / a_appState bits IdleLC checks: a weapon worn, a shield worn. */
const SKILL_NEEDS_WEAPON = 1 << 1
const SKILL_NEEDS_SHIELD = 1 << 4
/** a_job_flag bits of the six base classes (bit = t_skill.a_job). */
const BASE_CLASS_BITS = 0b111111

/**
 * The drop box: pieces without a model of their own (helmets below level 97) point at it and show
 * nothing on the character.
 */
const INVISIBLE_MODEL = /item_treasure/i

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

/** Spawn points closer than this (metres) belong to one hunting ground. */
const SPAWN_LINK = 40

/**
 * Where a monster hunts in a zone: the spawn point (t_npc_regen, ground layer) in the middle of its
 * biggest group of spawns (by how many monsters the group keeps up), as [x, z] map metres.
 */
export function huntingPoint(points) {
  if (points.length === 0) return null
  const parent = points.map((_, i) => i)
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const [ax, az] = points[i]
      const [bx, bz] = points[j]
      if (Math.hypot(ax - bx, az - bz) <= SPAWN_LINK) parent[find(i)] = find(j)
    }
  }
  const groups = new Map()
  points.forEach((p, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), p])
  })
  const weight = (group) => group.reduce((sum, p) => sum + Math.max(1, p[2]), 0)
  const biggest = [...groups.values()].sort((a, b) => weight(b) - weight(a))[0]
  let best = biggest[0]
  let bestSum = Infinity
  for (const p of biggest) {
    const sum = biggest.reduce((total, q) => total + Math.hypot(p[0] - q[0], p[1] - q[1]), 0)
    if (sum < bestSum) [best, bestSum] = [p, sum]
  }
  return [Math.round(best[0] * 10) / 10, Math.round(best[1] * 10) / 10]
}

function buildData(tables) {
  const npcs = new Map(tables.t_npc.map((r) => [int(r.a_index), r]))
  const zoneOfNpc = new Map()
  /** npc index → zone → spawn points [x, z, how many] on the ground layer */
  const spawnsOfNpc = new Map()
  for (const r of tables.t_npc_regen) {
    const zone = int(r.a_zone_num)
    const list = zoneOfNpc.get(int(r.a_npc_idx)) ?? new Set()
    list.add(zone)
    zoneOfNpc.set(int(r.a_npc_idx), list)
    if (int(r.a_y_layer) !== 0) continue
    const byZone = spawnsOfNpc.get(int(r.a_npc_idx)) ?? new Map()
    byZone.set(zone, [
      ...(byZone.get(zone) ?? []),
      [num(r.a_pos_x), num(r.a_pos_z), int(r.a_total_num)],
    ])
    spawnsOfNpc.set(int(r.a_npc_idx), byZone)
  }

  const fieldIndexes = new Set([...FIELD_ZONES, ...DUNGEON_ZONES].map((z) => z.index))
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
      ...sourceNpc(r),
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
      // the hunting ground in each zone, from the spawn table (map metres)
      spawns: Object.fromEntries(
        zones.flatMap((z) => {
          const point = huntingPoint(spawnsOfNpc.get(index)?.get(z) ?? [])
          return point ? [[`lc-zone-${z}`, point]] : []
        }),
      ),
      drops,
    })
  }
  monsters.sort((a, b) => a.level - b.level || a.npcIndex - b.npcIndex)

  const zones = [...FIELD_ZONES, ...DUNGEON_ZONES]
    .map((z) => {
      const list = monsters.filter((m) => m.zones.includes(`lc-zone-${z.index}`))
      return {
        id: `lc-zone-${z.index}`,
        index: z.index,
        name: z.name,
        minLevel: list.length ? Math.max(1, Math.min(...list.map((m) => m.level))) : 1,
        monsterIds: list.map((m) => m.id),
      }
    })
    .filter((z) => z.monsterIds.length > 0)

  const itemRows = new Map(tables.t_item.map((r) => [int(r.a_index), r]))
  const isGear = (r) =>
    ((int(r.a_type_idx) === 0 && CLASS_WEAPONS.has(int(r.a_subtype_idx))) ||
      int(r.a_type_idx) === 1) &&
    GEAR_SLOTS.includes(int(r.a_wearing)) &&
    int(r.a_level) >= 1
  const usable = (r) => int(r.a_enable) === 1 && String(r.a_name_usa ?? '').trim() !== ''

  const potions = buildPotions(tables, itemRows, usable)
  const starterGear = buildStarterGear(tables.t_item, isGear, usable)
  const shops = buildShops(tables, itemRows, isGear, usable, potions)
  const shopGear = buildShopGear(tables.t_item, isGear, usable)
  // plain accessories: no shop or monster sells them in the dump, IdleLC's shop does (own decision)
  const accessories = tables.t_item
    .filter(
      (r) =>
        usable(r) &&
        int(r.a_type_idx) === 5 &&
        int(r.a_subtype_idx) <= 4 &&
        int(r.a_flag) === FLAG_MAGIC_ACCESSORY &&
        int(r.a_price) > 0 &&
        String(r.a_descr_usa ?? '').trim() === 'Magical Accessory',
    )
    .sort((a, b) => int(a.a_subtype_idx) - int(b.a_subtype_idx) || int(a.a_price) - int(b.a_price))
    .map((r) => int(r.a_index))
  accessories.forEach((id) => usedItems.add(id))
  for (const slots of Object.values(shopGear))
    for (const tiers of Object.values(slots))
      for (const t of tiers) t.items.forEach((id) => usedItems.add(id))
  for (const ids of Object.values(starterGear)) ids.forEach((id) => usedItems.add(id))
  // the Phoenix event gear (token price) is not in the shop but stays known: pieces bought before
  // keep working
  for (const r of tables.t_item) {
    if (
      usable(r) &&
      isGear(r) &&
      int(r.a_price) === EVENT_GEAR_PRICE &&
      (int(r.a_job_flag) & BASE_CLASS_BITS) !== 0
    )
      usedItems.add(int(r.a_index))
  }
  UPGRADE_STONES.forEach((id) => usedItems.add(id))
  BOOST_POTIONS.forEach((id) => usedItems.add(id))
  DUNGEON_SUPER_ITEMS.forEach((id) => usedItems.add(id))
  const titles = buildTitles(tables.t_title, itemRows)
  titles.forEach((t) => usedItems.add(t.item))
  const titleOfItem = new Map(titles.map((t) => [t.item, t.id]))
  const shopItems = new Set(Object.values(shops).flat())
  shopItems.forEach((id) => usedItems.add(id))
  MAGNIFIERS.forEach((id) => usedItems.add(id))
  const gearReference = buildGearReference(
    [...usedItems].map((id) => itemRows.get(id)).filter((r) => r && isGear(r) && usable(r)),
  )

  // rare items: the t_rareoption sets each piece can get when it is identified, with their weights;
  // from level 77 every rare piece of a slot can also get that slot's special sets (owner's rule)
  const rareOf = (r) => {
    if (!isGear(r) || (int(r.a_job_flag) & BASE_CLASS_BITS) === 0) return []
    const sets = []
    for (let i = 0; i < 10; i++) {
      const set = int(r[`a_rare_index_${i}`])
      const weight = int(r[`a_rare_prob_${i}`])
      if (set > 0 && weight > 0) sets.push([set, weight])
    }
    if (sets.length > 0 && int(r.a_level) >= SPECIAL_RARE_LEVEL) {
      for (const [set, weight] of SPECIAL_RARE_SETS[int(r.a_wearing)] ?? []) {
        if (!sets.some(([s]) => s === set)) sets.push([set, weight])
      }
    }
    return sets
  }
  const items = tables.t_item
    .filter((r) => usedItems.has(int(r.a_index)))
    .map((r) => ({
      id: int(r.a_index),
      // a title item is called like its title (some have no English name of their own)
      name: titleOfItem.has(int(r.a_index))
        ? titles.find((t) => t.id === titleOfItem.get(int(r.a_index))).name
        : String(r.a_name_usa ?? '').trim() || `Item ${r.a_index}`,
      type: int(r.a_type_idx),
      subtype: int(r.a_subtype_idx),
      slot: int(r.a_wearing),
      level: int(r.a_level),
      jobFlag: int(r.a_job_flag),
      flag: int(r.a_flag),
      price: OWN_PRICES.get(int(r.a_index)) ?? int(r.a_price),
      stats: [0, 1, 2, 3, 4].map((k) => int(r[`a_num_${k}`])),
      icon: { atlas: int(r.a_texture_id), row: int(r.a_texture_row), col: int(r.a_texture_col) },
      ...(potions.has(int(r.a_index)) ? { potion: potions.get(int(r.a_index)) } : {}),
      ...(rareOf(r).length > 0 ? { rare: rareOf(r) } : {}),
      ...(titleOfItem.has(int(r.a_index)) ? { title: titleOfItem.get(int(r.a_index)) } : {}),
    }))
  items.push(...OWN_ITEMS)
  const rareSets = buildRareSets(
    tables.t_rareoption,
    new Set(items.flatMap((i) => (i.rare ?? []).map(([set]) => set))),
  )

  const expTable = Array.from({ length: MAX_LEVEL }, () => 0)
  for (const r of tables.t_exp) {
    const level = int(r.a_level)
    if (level >= 1 && level <= MAX_LEVEL) expTable[level - 1] = num(r.a_exp)
  }

  const skills = buildSkills(tables)
  // Run-only pool: advanced buffs never enter the ordinary class learning list.
  const dungeonBuffs = buildSkills(tables, null, true).filter((s) => {
    const last = s.levels.at(-1)
    return (
      s.type !== 3 &&
      last.duration > 0 &&
      last.effects.length > 0 &&
      last.effects.every((e) => e.type === 0 || e.type === 1)
    )
  })
  // the extra blessings at the one level they are offered (renumbered 1, the source level kept)
  for (const skill of buildSkills(tables, new Set(EXTRA_DUNGEON_BUFFS.map((b) => b.id)))) {
    const extra = EXTRA_DUNGEON_BUFFS.find((b) => b.id === skill.id)
    const row = skill.levels.find((l) => l.level === extra.level)
    if (!row) throw new Error(`No level ${extra.level} of skill ${skill.id}`)
    dungeonBuffs.push({
      ...skill,
      classId: extra.origin,
      sourceLevel: extra.level,
      // a pet's strengthening has no duration of its own; a blessing lasts to the end of the run
      levels: [{ ...row, level: 1, duration: Math.max(row.duration, 6000) }],
    })
  }
  const npcSkillIds = new Set(monsters.flatMap((m) => (m.skills ?? []).map((s) => s.id)))
  const npcSkills = buildSkills(tables, npcSkillIds).map((definition) => {
    const skill = { ...definition }
    delete skill.classId
    delete skill.icon
    return skill
  })

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
    shopGear,
    accessories,
    options: buildOptions(tables.t_option),
    rareSets,
    magnifiers: MAGNIFIERS,
    titles,
    starterGear,
    gearReference,
    skills,
    dungeonBuffs,
    dungeonSuperBuffs: buildDungeonSuperBuffs(tables),
    npcSkills,
  }
}

const numbers = (text) =>
  String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)

/**
 * Owner's rule (2026-10-30): rare pieces from level 77 can get their slot's special grade-A sets —
 * helmets Casting-Up (53, skill cooldown), armor and pants Anti-Stun / Anti-Silence / Anti-Stone (56,
 * 57, 60), boots Speed-Up (59, move speed) — with the weights other pieces have them with in the
 * database. By t_item.a_wearing: [t_rareoption index, weight].
 */
const SPECIAL_RARE_LEVEL = 77
const SPECIAL_RARE_SETS = {
  0: [[53, 250]],
  1: [
    [56, 125],
    [57, 125],
    [60, 125],
  ],
  3: [
    [56, 125],
    [57, 125],
    [60, 125],
  ],
  6: [[59, 250]],
}

/** "FF8000FF" (RRGGBBAA) → "#ff8000". */
const rgb = (rgba) =>
  `#${String(rgba ?? '000000')
    .slice(0, 6)
    .toLowerCase()
    .padEnd(6, '0')}`

/**
 * English names of the titles whose item has none (t_title.a_name is Korean or a short English
 * name) — own translations.
 */
const TITLE_NAMES = {
  1: 'G.M.F',
  2: '2009 Korea Champion',
  3: '2009 World Tournament Champion',
  4: '2009 World Tournament Runner-up',
  5: '2009 World Tournament Third Place',
  7: '2009 Korea Second Place',
  52: 'Requested Title',
  68: 'Sparta',
  74: 'The Last One',
  75: 'King of Enchant (7 days)',
  76: 'King of Enchant (3 days)',
  77: 'King of Enchant (1 day)',
  78: 'King of Enchant (30 days)',
  82: 'Greatest Benefactor',
  96: 'The Winner of Level Hunting',
}

/** The game's name stays out of the UI ("LastChaos Newbie" → "Newbie"). */
const withoutGameName = (text) =>
  text
    .replace(/\s*(?:to|in|of|for)?\s*Last ?Chaos\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

/** Only English text (the Korean descriptions of a few titles are left out). */
const english = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : '')

/**
 * Titles 1:1 from t_title (all enabled ones): the item that gives the title, its name and
 * description (t_item a_name_usa / a_descr_usa; TITLE_NAMES when the item has none), days it lasts
 * (null = permanent), text and outline colours, up to five t_option options and the client effect.
 */
function buildTitles(rows, itemRows) {
  const titles = new Map()
  for (const r of rows) {
    const id = int(r.a_index)
    const item = itemRows.get(int(r.a_item_index))
    const name = withoutGameName(String(item?.a_name_usa ?? '').trim() || TITLE_NAMES[id] || '')
    if (titles.has(id) || int(r.a_enable) !== 1 || !item || !name) continue
    const options = []
    for (let k = 0; k < 5; k++) {
      const type = int(r[`a_option_index${k}`])
      const level = int(r[`a_option_level${k}`])
      if (type >= 0 && level > 0) options.push({ type, level })
    }
    titles.set(id, {
      id,
      item: int(r.a_item_index),
      name,
      description: withoutGameName(english(String(item.a_descr_usa ?? '').trim())),
      days: int(r.a_time) > 0 ? int(r.a_time) : null,
      color: rgb(r.a_color),
      outline: rgb(r.a_bgcolor),
      options,
      effect: String(r.a_effect_name ?? '').trim(),
    })
  }
  return [...titles.values()].sort((a, b) => a.id - b.id)
}

/**
 * Item options 1:1 from t_option: per option level the value (a_level list) and the roll weight
 * (a_prob list; levels with weight 0 never roll), and where the option may appear: weapon subtypes
 * (a_weapon_type bits), armor subtypes (a_wear_type) and accessory subtypes (a_accessory_type).
 * Options with all weights 0 never roll on their own; rare option sets still use them.
 */
function buildOptions(rows) {
  return rows
    .map((r) => {
      const weights = numbers(r.a_prob)
      const values = numbers(r.a_level).slice(0, weights.length)
      return {
        type: int(r.a_type),
        name: String(r.a_name_usa ?? '').trim(),
        values,
        weights: weights.slice(0, values.length),
        weaponMask: int(r.a_weapon_type),
        armorMask: int(r.a_wear_type),
        accessoryMask: int(r.a_accessory_type),
      }
    })
    .filter((o) => o.name && o.values.length > 0)
    .sort((a, b) => a.type - b.type)
}

/**
 * Rare option sets 1:1 from t_rareoption: grade (0 = A, the best … 4 = E), weapon / armor /
 * accessory (a_type 0 / 1 / 2), the name prefix, flat attack / defense / magic attack / magic
 * defense bonuses and up to 10 options, each with its level and its chance in 1/10 000.
 */
function buildRareSets(rows, used) {
  return rows
    .filter((r) => used.has(int(r.a_index)))
    .map((r) => {
      const options = []
      for (let i = 0; i < 10; i++) {
        const type = int(r[`a_option_index${i}`])
        const chance = int(r[`a_option_prob${i}`])
        if (type >= 0 && chance > 0) {
          options.push({ type, level: int(r[`a_option_level${i}`]), chance })
        }
      }
      return {
        id: int(r.a_index),
        grade: int(r.a_grade),
        type: int(r.a_type),
        prefix: String(r.a_prefix_usa ?? '').trim(),
        attack: int(r.a_attack),
        defense: int(r.a_defense),
        magic: int(r.a_magic),
        resist: int(r.a_resist),
        options,
      }
    })
    .sort((a, b) => a.id - b.id)
}

/**
 * Potions are skills in LC: t_item.a_num_0 points at a t_skill whose level 1 holds the effect (heal or
 * mana over time, faster recovery), its duration and its reuse time.
 */
function buildPotions(tables, itemRows, usable) {
  const skills = new Map(tables.t_skill.map((r) => [int(r.a_index), r]))
  const level1 = new Map(
    tables.t_skilllevel.filter((r) => int(r.a_level) === 1).map((r) => [int(r.a_index), r]),
  )
  const magics = new Map(tables.t_magic.map((r) => [int(r.a_index), r]))
  const powers = new Map(tables.t_magiclevel.map((r) => [`${int(r.a_index)}/${int(r.a_level)}`, r]))
  const levels = new Map(tables.t_skilllevel.map((r) => [`${int(r.a_index)}/${int(r.a_level)}`, r]))
  const potions = new Map()
  for (const r of itemRows.values()) {
    if (int(r.a_type_idx) !== 6 || !usable(r)) continue
    if (BOOST_POTIONS.has(int(r.a_index))) {
      // the skill level the item casts (t_item.a_num_1), its stat changes as skill effects
      const skill = skills.get(int(r.a_num_0))
      const level = levels.get(`${int(r.a_num_0)}/${Math.max(1, int(r.a_num_1))}`)
      if (!skill || !level) continue
      const effects = [1, 2, 3].flatMap((k) => {
        const magic = magics.get(int(level[`a_magicIndex${k}`]))
        if (!magic) return []
        const magicLevel = int(level[`a_magicLevel${k}`])
        const power = powers.get(`${int(magic.a_index)}/${magicLevel}`)
        return [
          {
            magic: int(magic.a_index),
            magicLevel,
            type: int(magic.a_type),
            subtype: int(magic.a_subtype),
            damageType: int(magic.a_damagetype),
            power: power ? int(power.a_power) : 0,
          },
        ]
      })
      const flag = int(skill.a_flag)
      const hard = HARDCODED_BOOSTS.get(int(r.a_index))
      potions.set(int(r.a_index), {
        kind: 'boost',
        power: 0,
        duration: int(level.a_durtime) / 10,
        cooldown: int(skill.a_reuseTime) / 10,
        skill: int(skill.a_index),
        effects: hard ? [] : effects,
        ...(hard?.steal ? { steal: hard.steal } : {}),
        ...(hard?.berserker ? { berserker: true } : {}),
        ...(hard?.rewards
          ? {
              rewards: {
                exp: hard.rewards === 'exp' ? (effects[0]?.power ?? 0) : 0,
                sp: hard.rewards === 'sp' ? (effects[0]?.power ?? 0) : 0,
                gold: 0,
                drop: 0,
              },
            }
          : {}),
        ...(flag & SF_NOCANCEL ? { keepOnDeath: true } : {}),
        ...(flag & SF_ABSTIME ? { realTime: true } : {}),
        ...(flag & SF_NOTDUPLICATE ? { exclusive: true } : {}),
        ...(NO_COOLDOWN_POTIONS.has(int(r.a_index)) ? { noCooldown: true } : {}),
      })
      continue
    }
    const skill = skills.get(int(r.a_num_0))
    const level = level1.get(int(r.a_num_0))
    const magic = level && magics.get(int(level.a_magicIndex1))
    if (!skill || !magic) continue
    const kind =
      int(magic.a_type) === 2 && int(magic.a_subtype) === 9
        ? 'hp'
        : int(magic.a_type) === 2 && int(magic.a_subtype) === 10
          ? 'mp'
          : int(magic.a_type) === 0 && int(magic.a_subtype) === 10
            ? 'hpRegen'
            : int(magic.a_type) === 0 && int(magic.a_subtype) === 11
              ? 'mpRegen'
              : null
    if (!kind) continue
    const power = powers.get(`${int(magic.a_index)}/${int(level.a_magicLevel1)}`)
    potions.set(int(r.a_index), {
      kind,
      power: power ? int(power.a_power) : 0,
      duration: int(level.a_durtime) / 10,
      cooldown: int(skill.a_reuseTime) / 10,
    })
  }
  return potions
}

/**
 * Gear the IdleLC shop offers a class, by slot and tier (t_item.a_level): of the regular pieces of
 * each tier with the tier's most common price (premium sets cost more), the weakest one. Level-1
 * pieces are left out — every character starts with them. The shop shows the tiers around the
 * character's level.
 */
function buildShopGear(itemTable, isGear, usable) {
  const shopGear = {}
  SKILL_CLASSES.forEach((classId, job) => {
    const own = itemTable.filter(
      (r) =>
        usable(r) &&
        isGear(r) &&
        isRegularGear(int(r.a_flag)) &&
        int(r.a_price) >= MIN_SHOP_PRICE &&
        int(r.a_level) > 1 &&
        int(r.a_level) <= MAX_LEVEL &&
        (int(r.a_job_flag) & jobBit(job)) !== 0,
    )
    const slots = {}
    for (const slot of GEAR_SLOTS) {
      const byLevel = new Map()
      for (const r of own.filter((r) => int(r.a_wearing) === slot)) {
        const list = byLevel.get(int(r.a_level)) ?? []
        list.push(r)
        byLevel.set(int(r.a_level), list)
      }
      const tiers = [...byLevel]
        .sort((a, b) => a[0] - b[0])
        .map(([level, pieces]) => {
          const prices = new Map()
          for (const r of pieces) prices.set(int(r.a_price), (prices.get(int(r.a_price)) ?? 0) + 1)
          const [mainPrice] = [...prices].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]
          // one piece per tier (owner's rule): the weakest of the main line — attack + magic
          // attack, or defense + magic defense (a_num_0 + a_num_1) — so the same item listed
          // under several ids and the stronger variants of a tier don't fill the shop
          const power = (r) => int(r.a_num_0) + int(r.a_num_1)
          const [weakest] = pieces
            .filter((r) => int(r.a_price) === mainPrice)
            .sort((a, b) => power(a) - power(b) || int(a.a_index) - int(b.a_index))
          return { level, items: [int(weakest.a_index)] }
        })
      if (tiers.length) slots[slot] = tiers
    }
    shopGear[classId] = slots
  })
  return shopGear
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
 * the base classes, upgrade stones and potions. Keyed by IdleLC zone id.
 */
function buildShops(tables, itemRows, isGear, usable, potions) {
  const fieldZones = new Map(FIELD_ZONES.map((z) => [z.index, `lc-zone-${z.index}`]))
  const zoneOfKeeper = new Map(tables.t_shop.map((r) => [int(r.a_keeper_idx), int(r.a_zone_num)]))
  const shops = {}
  for (const r of tables.t_shopitem) {
    const zoneId = fieldZones.get(zoneOfKeeper.get(int(r.a_keeper_idx)))
    const item = itemRows.get(int(r.a_item_idx))
    if (!zoneId || !item || !usable(item) || int(item.a_price) <= 0) continue
    const gear = isGear(item) && (int(item.a_job_flag) & BASE_CLASS_BITS) !== 0
    if (!gear && !UPGRADE_STONES.has(int(item.a_index)) && !potions.has(int(item.a_index))) continue
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
 * Dungeon blessings beyond the class buffs (owner's request, 2026-11-07), each at one fixed level:
 * Basic Ignition 2 (an item skill: +200% attack and magic attack), the horse's Attack Power
 * Increase and Armor Increase at 30 (their top level), and two picked by Claude: the mount's HP/MP
 * up at 10 (its top level) and the dragon's Magical Power at 30, the casters' counterpart of the
 * horse's attack. `origin` is shown where class buffs show their class.
 */
export const EXTRA_DUNGEON_BUFFS = [
  { id: 1062, level: 2, origin: 'item' },
  { id: 257, level: 30, origin: 'horse' },
  { id: 259, level: 30, origin: 'horse' },
  { id: 270, level: 10, origin: 'mount' },
  { id: 276, level: 30, origin: 'dragon' },
]

/**
 * Class skills 1:1: t_skill (name, description, type, timings in 1/10 s, icon) with every level from
 * t_skilllevel (mana, learn level, SP, duration, prerequisites) and its effects from t_magic /
 * t_magiclevel (type, subtype, damage type, power). How the game uses them: src/game/logic/skills.ts.
 */
/**
 * What a skill needs worn, 1:1 from t_skill: weapon kinds (a_use/appWeaponType0/1 = t_item.a_subtype_idx),
 * a weapon at all and a shield (a_useState / a_appState bits); nothing when it needs nothing.
 */
function gearNeeds(key, type0, type1, state) {
  const weapons = [int(type0), int(type1)].filter((t) => t >= 0)
  const weapon = (int(state) & SKILL_NEEDS_WEAPON) !== 0
  const shield = (int(state) & SKILL_NEEDS_SHIELD) !== 0
  return weapons.length || weapon || shield ? { [key]: { weapons, weapon, shield } } : {}
}

export function buildSkills(tables, npcIds = null, dungeon = false) {
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
    if (
      npcIds
        ? !npcIds.has(int(r.a_index))
        : job < 0 || job >= SKILL_CLASSES.length || (!dungeon && int(r.a_job2) !== 0) || !name
    )
      continue
    const rows = (levelsOf.get(int(r.a_index)) ?? []).sort(
      (a, b) => int(a.a_level) - int(b.a_level),
    )
    if (rows.length === 0 || (!npcIds && !dungeon && int(rows[0].a_learnLevel) > MAX_LEVEL))
      continue
    const levels = rows.map((l) => {
      const effects = []
      for (let k = 1; k <= 3; k++) {
        const magic = magics.get(int(l[`a_magicIndex${k}`]))
        if (!magic) continue
        const power = magicPower.get(`${int(magic.a_index)}/${int(l[`a_magicLevel${k}`])}`)
        if (!power)
          throw new Error(
            `Missing t_magiclevel ${int(magic.a_index)}/${int(l[`a_magicLevel${k}`])}`,
          )
        effects.push({
          magic: int(magic.a_index),
          type: int(magic.a_type),
          subtype: int(magic.a_subtype),
          damageType: int(magic.a_damagetype),
          power: int(power.a_power),
          ...sourceMagic(magic, power, int(l[`a_magicLevel${k}`])),
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
        ...sourceFields(l, {
          targetMax: 'a_targetNum',
          learnStrength: 'a_learnStr',
          learnDexterity: 'a_learnDex',
          learnIntelligence: 'a_learnInt',
          learnConstitution: 'a_learnCon',
        }),
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
      ...sourceFields(r, {
        flag: 'a_flag',
        useState: 'a_useState',
        applyState: 'a_appState',
        sorcerer: 'a_sorcerer',
        stillTime: 'a_stillTime',
        appRange: 'a_appRange',
        fireRange: 'a_fireRange',
        fireRange2: 'a_fireRange2',
      }),
      ...gearNeeds('needs', r.a_useWeaponType0, r.a_useWeaponType1, r.a_useState),
      ...gearNeeds('passiveNeeds', r.a_appWeaponType0, r.a_appWeaponType1, r.a_appState),
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

/**
 * The model (t_item.a_file_smc) of every weapon and armor piece the six classes wear in the game
 * data: .smc path → item ids. `npm run convert-lc` turns each into a GLB shown on the character.
 */
function buildGearModels(items, itemRows) {
  const rows = new Map(itemRows.map((r) => [int(r.a_index), r]))
  const models = {}
  for (const item of items) {
    const gear = (item.type === 0 || item.type === 1) && GEAR_SLOTS.includes(item.slot)
    if (!gear || (item.jobFlag & BASE_CLASS_BITS) === 0) continue
    const smc = String(rows.get(item.id)?.a_file_smc ?? '').trim()
    if (!smc || INVISIBLE_MODEL.test(smc)) continue
    ;(models[smc] ??= []).push(item.id)
  }
  return models
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
    't_option',
    't_rareoption',
    't_title',
  ])
  const data = buildData(tables)
  const gearModels = buildGearModels(data.items, tables.t_item)
  const manifest = await buildModelManifest(data, args.models)

  fs.mkdirSync(args.out, { recursive: true })
  fs.writeFileSync(path.join(args.out, 'lc-data.json'), JSON.stringify(data))
  fs.writeFileSync(path.join(args.out, 'lc-models.json'), JSON.stringify(manifest, null, 2))
  fs.writeFileSync(path.join(args.out, 'lc-item-models.json'), JSON.stringify(gearModels, null, 1))

  const withModel = new Set(manifest.models.map((m) => m.id))
  console.log(
    `monsters ${data.monsters.length} (${data.monsters.filter((m) => withModel.has(m.model)).length} with a converted model), ` +
      `zones ${data.zones.map((z) => `${z.name}:${z.monsterIds.length}`).join(' ')}, items ${data.items.length}, ` +
      `models ${manifest.models.map((m) => m.id).join(', ') || 'none'}`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
