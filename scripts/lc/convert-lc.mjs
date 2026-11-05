#!/usr/bin/env node
/**
 * Converts LC client models into optimized GLB files for the game (public/models/lc, committed by
 * the owner's decision; the client folder itself stays out of the repo).
 *
 *   npm run convert-lc -- --client <client folder> [--client <another>] [options]
 *
 * Without --smc it converts the player class bodies (classes.mjs), every monster model listed
 * in src/game/data/generated/lc-data.json (run `npm run import-lc-db` first), keeping only the
 * clips the database uses, and the weapon and armor models of lc-item-models.json (into gear/, skinned
 * to their class skeleton), then refreshes lc-models.json and lc-gear.json. It also cuts the item and
 * skill icons out of the ItemBtn*.tex / SkillBtn*.tex atlases into public/icons/lc/ (+ lc-icons.json).
 *
 * Options:
 *   --out <dir>            output folder (default public/models/lc)
 *   --data <lc-data.json>  generated game data (default src/game/data/generated/lc-data.json)
 *   --only <id,id>         convert only these model ids (e.g. fox,class-knight,gear/ni_bu_001); `gear` = all
 *                          weapon and armor models, `starter` = the classes' starting sets,
 *                          `icons` = item and skill icons, `ui` = interface pieces, `fx` = effect textures
 *   --batch <json>         select the model ids in a reviewed recovery batch (instead of --only)
 *   --strict               fail models with missing or unreadable dependencies
 *   --map <id>             with --only terrain, convert just this map (juno or dratan)
 *   --smc <path>           convert one .smc (client path or file); with --anims <a,b> to pick clips
 *   --max-texture <px>     longest texture side (default 1024)
 *
 * See docs/lc-formats.md for the file formats.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { CLASS_MODELS, gearClass } from './classes.mjs'
import { ClientFiles } from './client.mjs'
import { ICON_KINDS, buildIconSheet, buildPortraitSheet, iconColor } from './icons.mjs'
import { buildFxTextures } from './fx.mjs'
import { buildUiParts } from './ui.mjs'
import { buildGearManifest, buildModelManifest, modelIdFromSmc } from './manifest.mjs'
import { buildModel } from './model.mjs'
import { buildProps, obstacles, placedModels } from './props.mjs'
import { parseSkillAnims } from './skill-anims.mjs'
import { parseSmc } from './smc.mjs'
import { chooseAnimSets } from './source-choice.mjs'
import { buildNav, navObstacles, walkableShare } from './nav.mjs'
import { buildTerrain, parseTerrain } from './terrain.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const GENERATED = path.join(ROOT, 'src/game/data/generated')
const DEFAULT_OUT = path.join(ROOT, 'public/models/lc')
/** Skill id → the hero's clips for it (from the client's skills.lod; read by the game). */
const SKILL_ANIMS = path.join(GENERATED, 'lc-skill-anims.json')
/** Gear .smc → item ids (written by `npm run import-lc-db`). */
const ITEM_MODELS = path.join(GENERATED, 'lc-item-models.json')
/** Longest texture side of weapon and armor models (WebP): small on screen, and there are many. */
const GEAR_MAX_TEXTURE = 512
/** Colour of gear whose texture and icon can't be read (linear RGB). */
const GEAR_GREY = [0.3, 0.3, 0.32]
/**
 * Legacy fallbacks for encrypted clients. A readable original always takes priority.
 */
const MONSTER_SMC_STANDINS = {
  cusedrich: 'Data\\Monster\\CusedRich2\\cusedrich2.smc',
  cused_wever: 'Data\\Monster\\CusedWever2\\cused_wever2.smc',
}
/**
 * Open-world maps drawn in the game (public/maps/<map>/): the terrain and world files, the town (no
 * fights there), the layers that are water or road, how many hunting grounds (one per spot) and
 * which way the camera looks (each ground has trees or buildings in view).
 * Juno's spawn points in the database don't fit the client's map, so its hunting grounds are picked
 * on level ground clear of trees and buildings (scripts/lc/terrain.mjs).
 */
const MAPS = {
  juno: {
    wtr: 'Data\\World\\StartZone\\startzone.wtr',
    wld: 'Data\\World\\StartZone\\startzone.wld',
    count: 40,
    // the game's camera looks this way along the ground (src/scene/viewState.ts, CAMERA_OFFSET)
    view: [-0.354, -0.935],
    town: [1170, 1015],
    townRadius: 280,
    avoidLayers: [2, 8],
    // the river bed's texture: no running through the water
    waterLayers: [8],
    // the client's StartZone attribute map belongs to the older Juno layout (like the spawn table):
    // walkable ground comes from slope, trees and buildings instead
  },
  dratan: {
    wtr: 'Data\\World\\Dratan\\Dratan.wtr',
    wld: 'Data\\World\\Dratan\\Dratan.wld',
    // the spawn table fits this terrain: each monster fights where it spawns (lc-data spawns)
    spawnZone: 'lc-zone-4',
    sat: 'Data\\World\\Dratan\\Dratan_3072_3072_0_1F.sat',
    count: 42,
    view: [-0.354, -0.935],
    // The world file's main settlement; arenas use the same clear-ground policy as Juno.
    town: [2580, 2794],
    townRadius: 280,
    avoidLayers: [8],
  },
  merac: {
    wtr: 'Data\\World\\Merac\\Merac.wtr',
    wld: 'Data\\World\\Merac\\Merac.wld',
    spawnZone: 'lc-zone-7',
    sat: 'Data\\World\\Merac\\Merac_1536_1536_0.sat',
    count: 23,
    view: [-0.354, -0.935],
    // w3_gate_A's settlement entrance in Merac.wld; routes remain IdleLC hunting spots.
    town: [484.9375, 352.3125],
    townRadius: 180,
    avoidLayers: [],
  },
  egeha: {
    wtr: 'Data\\World\\Egeha\\Egeha.wtr',
    wld: 'Data\\World\\Egeha\\Egeha.wld',
    // no attribute map in the client: walkable ground from slope, trees and buildings
    spawnZone: 'lc-zone-15',
    count: 15,
    view: [-0.354, -0.935],
    // Egeha_start_00's placement in Egeha.wld.
    town: [1470, 273],
    townRadius: 180,
    avoidLayers: [],
  },
}
/**
 * Monsters without a hunting spot, as in src/game/data/zones.ts: the event monsters and the raid
 * bosses.
 */
const NO_SPOT = new Set([
  ...['lc-1105', 'lc-454', 'lc-1633'],
  ...['lc-308', 'lc-152', 'lc-309', 'lc-1339', 'lc-331', 'lc-504', 'lc-505', 'lc-1553'],
])

/**
 * A zone's hunting grounds: its monsters' spawn points (lc-data `spawns`) in the game's spot order
 * (src/game/data/zones.ts huntingOrder: level, plain before elite, HP, attack, database order), so
 * the props cover the runs between neighbouring spots.
 */
function spawnGrounds(data, zoneId) {
  const zone = data?.zones.find((z) => z.id === zoneId)
  const monsters = new Map((data?.monsters ?? []).map((m) => [m.id, m]))
  const key = (m) => [m.level, m.elite ? 1 : 0, m.hp, m.attack]
  const ids = (zone?.monsterIds ?? [])
    .filter((id) => !NO_SPOT.has(id) && monsters.get(id)?.spawns?.[zoneId])
    .map((id, i) => ({ m: monsters.get(id), i }))
    .sort((a, b) => {
      const ka = key(a.m)
      const kb = key(b.m)
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] - kb[k]
      return a.i - b.i
    })
  if (ids.length === 0) throw new Error(`no spawn points for ${zoneId} (run import-lc-db)`)
  return ids.map(({ m }) => m.spawns[zoneId])
}

/**
 * Writes public/maps/<map>/nav.bin (the walkable grid, scripts/lc/nav.mjs) and its entry in the
 * map's terrain.json; reports how many hunting grounds stand on walkable ground.
 */
function writeNav(files, map, def, world) {
  const dir = path.join(ROOT, 'public', 'maps', map)
  const metaFile = path.join(dir, 'terrain.json')
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
  const size = (meta.width - 1) * meta.cell
  let source
  if (def.sat && files.resolve(def.sat)) {
    const satSize = Number(/_(\d+)_\d+_\d+(?:_\w+)?\.sat$/i.exec(def.sat)?.[1])
    source = { sat: files.read(def.sat), satSize }
  } else {
    source = {
      terrain: parseTerrain(files.read(def.wtr)),
      waterLayers: def.waterLayers ?? [],
      obstacles: navObstacles(world),
    }
  }
  const nav = buildNav({ size, ...source })
  fs.writeFileSync(path.join(dir, 'nav.bin'), nav.bits)
  meta.nav = { file: 'nav.bin', cell: nav.cell, width: nav.width, height: nav.height }
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  const share = walkableShare(nav, meta.arenas)
  console.log(
    `nav ${map}: ${nav.width}×${nav.height} cells of ${nav.cell} m from ` +
      `${source.sat ? 'the attribute map' : 'slope and props'}, ` +
      `${Math.round(share * 100)}% of ${meta.arenas.length} hunting grounds walkable`,
  )
}

/** Class portraits sheet (relative to public/). */
const PORTRAITS_FILE = 'icons/lc/portraits.webp'

function parseArgs(argv) {
  const args = {
    clients: [],
    out: DEFAULT_OUT,
    data: path.join(GENERATED, 'lc-data.json'),
    maxTexture: 1024,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${flag} needs a value`)
      return argv[++i]
    }
    if (flag === '--client') args.clients.push(path.resolve(value()))
    else if (flag === '--out') args.out = path.resolve(value())
    else if (flag === '--data') args.data = path.resolve(value())
    else if (flag === '--only') args.only = new Set(value().toLowerCase().split(','))
    else if (flag === '--batch') args.batch = path.resolve(value())
    else if (flag === '--strict') args.strict = true
    else if (flag === '--map') args.map = value().toLowerCase()
    else if (flag === '--smc') args.smc = value()
    else if (flag === '--anims') args.anims = value().split(',')
    else if (flag === '--max-texture') args.maxTexture = Number(value())
    else if (flag === '--help' || flag === '-h') args.help = true
    else throw new Error(`unknown option ${flag}`)
  }
  if (args.map && (!MAPS[args.map] || !(args.only?.has('terrain') || args.only?.has('nav'))))
    throw new Error('--map needs a known map and --only terrain or nav')
  if (args.batch) {
    if (args.only) throw new Error('--batch and --only cannot be combined')
    const batch = JSON.parse(fs.readFileSync(args.batch, 'utf8'))
    if (!Array.isArray(batch.models) || batch.models.some((model) => typeof model.id !== 'string'))
      throw new Error('batch needs a models array with string ids')
    args.only = new Set(batch.models.map((model) => model.id.toLowerCase()))
    args.allowedMissing = new Map(
      batch.models.map((model) => [model.id.toLowerCase(), new Set(model.allowedMissing ?? [])]),
    )
  }
  return args
}

/**
 * Conversion jobs: { id, smc (client path or parsed), animations (clip names or null), override
 * (fields replacing the .smc's: skeleton, animation sets), gear, starter }.
 */
function listJobs(args, data, files, itemModels, icons, skillAnims) {
  if (args.smc) {
    const smc = fs.existsSync(args.smc) ? path.resolve(args.smc) : args.smc
    return [{ id: modelIdFromSmc(args.smc), smc, animations: args.anims ?? null }]
  }
  const jobs = Object.entries(CLASS_MODELS).map(([id, def]) => ({
    id,
    smc: def.smc,
    // the basic clips and the class's skill clips
    animations: [
      ...Object.values(def.animations).flat(),
      ...(data?.skills ?? [])
        .filter((skill) => `class-${skill.classId}` === id)
        .flatMap((skill) => Object.values(skillAnims?.[skill.id] ?? {})),
    ],
    fallbackAnimSets: def.fallbackAnimSets,
  }))
  const monsters = new Map()
  for (const m of data?.monsters ?? []) {
    const job = monsters.get(m.model) ?? {
      id: m.model,
      smc: m.smc,
      fallbackSmc: MONSTER_SMC_STANDINS[m.model],
      animations: new Set(),
    }
    for (const clip of Object.values(m.animations).flat())
      if (clip) job.animations.add(String(clip))
    monsters.set(m.model, job)
  }
  let absent = 0
  for (const job of monsters.values()) {
    if (!files.resolve(job.smc) && !files.resolve(job.fallbackSmc ?? job.smc)) {
      absent++ // not in this client (yet)
      continue
    }
    jobs.push({ ...job, animations: [...job.animations] })
  }
  if (absent)
    console.log(`${absent} of ${monsters.size} monster models are not in the client folder(s)`)

  // weapons and armor: meshes only, skinned to the skeleton of the class that wears them
  const starter = new Set(Object.values(data?.starterGear ?? {}).flat())
  for (const [smc, items] of Object.entries(itemModels ?? {})) {
    const classId = gearClass(smc)
    if (!classId || !files.resolve(smc)) continue
    jobs.push({
      id: `gear/${modelIdFromSmc(smc)}`,
      smc,
      animations: [],
      override: { skeleton: CLASS_MODELS[classId].skeleton, animSets: [] },
      maxTextureSize: GEAR_MAX_TEXTURE,
      // textures the Nemesis client stores encrypted: the item's colour from its icon instead
      fallbackColor: () =>
        (icons && items.map((id) => iconColor(icons.sheet, icons.pixels, id)).find(Boolean)) ??
        GEAR_GREY,
      webp: true,
      usedBonesOnly: true,
      gear: true,
      starter: items.some((id) => starter.has(id)),
    })
  }
  if (!args.only) return jobs
  const selected = jobs.filter(
    (j) =>
      args.only.has(j.id) ||
      (j.gear && args.only.has('gear')) ||
      (j.starter && args.only.has('starter')),
  )
  const selectors = new Set(['gear', 'starter', 'icons', 'ui', 'fx', 'terrain', 'nav'])
  for (const id of args.only)
    if (!selectors.has(id) && !selected.some((job) => job.id === id))
      throw new Error(`requested model is unavailable: ${id}`)
  return selected
}

/**
 * The skill clips of the client's skills.lod (skill id → { fire } or { ready, still, fire }); written
 * to lc-skill-anims.json for the game. Without skills.lod in the client the existing file is kept.
 */
function readSkillAnims(files, data) {
  const previous = fs.existsSync(SKILL_ANIMS)
    ? JSON.parse(fs.readFileSync(SKILL_ANIMS, 'utf8'))
    : null
  if (!data?.skills || !files.resolve('Data\\skills.lod')) return previous
  const prefixes = Object.fromEntries(
    Object.entries(CLASS_MODELS).map(([id, def]) => [id.replace(/^class-/, ''), def.prefix]),
  )
  // The 2015 table has empty records for some skills known to later clients. Keep their existing
  // mappings as legacy fallbacks; exact nonempty records replace earlier guesses.
  const anims = {
    ...previous,
    ...Object.fromEntries(parseSkillAnims(files.read('Data\\skills.lod'), data.skills, prefixes)),
  }
  fs.mkdirSync(GENERATED, { recursive: true })
  fs.writeFileSync(SKILL_ANIMS, JSON.stringify(anims))
  console.log(`skill clips: ${Object.keys(anims).length} skills (lc-skill-anims.json)`)
  return anims
}

/** The game's item icon sheet (raw RGBA) and its lc-icons.json entry, or null. */
async function readItemIcons() {
  const manifestFile = path.join(GENERATED, 'lc-icons.json')
  if (!fs.existsSync(manifestFile)) return null
  const sheet = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).items
  const image = sheet && path.join(ROOT, 'public', sheet.file.replace(/\?.*$/, ''))
  if (!image || !fs.existsSync(image)) return null
  const pixels = await sharp(image).ensureAlpha().raw().toBuffer()
  return { sheet, pixels }
}

function readSmc(job, files) {
  if (typeof job.smc === 'object') return job.smc
  const text = fs.existsSync(job.smc)
    ? fs.readFileSync(job.smc, 'latin1')
    : files.read(job.smc).toString('latin1')
  const smc = { ...parseSmc(text), ...job.override }
  if (job.fallbackAnimSets) smc.animSets = chooseAnimSets(files, smc.animSets, job.fallbackAnimSets)
  return smc
}

const USAGE =
  'Usage: npm run convert-lc -- --client <client folder> [--client <another>] [--only fox,class-knight]\n' +
  '       [--smc <model.smc> [--anims a,b]] [--out <dir>] [--data <lc-data.json>] [--max-texture 1024]'

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`)
    process.exit(1)
  }
  if (args.help || args.clients.length === 0) {
    console.log(USAGE)
    process.exit(args.help ? 0 : 1)
  }

  const absent = args.clients.filter((dir) => !fs.existsSync(dir))
  if (absent.length) {
    console.error(`client folder not found: ${absent.join(', ')}`)
    process.exit(1)
  }
  const files = new ClientFiles(args.clients)
  console.log(`client: ${files.size} files in ${args.clients.join(', ')}`)
  const data = fs.existsSync(args.data) ? JSON.parse(fs.readFileSync(args.data, 'utf8')) : null
  const itemModels = fs.existsSync(ITEM_MODELS)
    ? JSON.parse(fs.readFileSync(ITEM_MODELS, 'utf8'))
    : null
  if (!data && !args.smc)
    console.warn(
      `no ${path.relative(ROOT, args.data)} — monsters skipped (run npm run import-lc-db first)`,
    )

  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })
  fs.mkdirSync(args.out, { recursive: true })

  // `--only icons` rebuilds just the item icons
  // `--only icons` / `--only ui` / `--only terrain` (or several) convert no models
  const iconsOnly =
    args.only !== undefined &&
    [...args.only].every((o) => ['icons', 'ui', 'fx', 'terrain', 'nav'].includes(o))
  // A selective asset conversion must not rewrite unrelated skill metadata.
  const updatesSkills =
    !args.smc && (!args.only || [...args.only].some((id) => id.startsWith('class-')))
  const skillAnims = updatesSkills
    ? readSkillAnims(files, data)
    : fs.existsSync(SKILL_ANIMS)
      ? JSON.parse(fs.readFileSync(SKILL_ANIMS, 'utf8'))
      : null
  const jobs = iconsOnly
    ? []
    : listJobs(args, data, files, itemModels, await readItemIcons(), skillAnims)
  const textureCache = new Map()
  const shaders = new Set()
  let converted = 0
  let failed = 0
  for (const job of jobs) {
    try {
      const options = {
        animations: job.animations,
        maxTextureSize: job.maxTextureSize ?? args.maxTexture,
        webp: job.webp,
        usedBonesOnly: job.usedBonesOnly,
        fallbackColor: job.fallbackColor?.(),
        textureCache,
      }
      const convert = async (source) => {
        const smc = readSmc({ ...job, smc: source }, files)
        let result = await buildModel(files, smc, options)
        if (
          job.animations?.length &&
          result.stats.animations.length === 0 &&
          result.stats.bones > 0
        )
          result = await buildModel(files, smc, { ...options, animations: null })
        if (
          result.stats.meshes === 0 ||
          (job.fallbackSmc && result.stats.unreadable.some((file) => /\.bm$/i.test(file)))
        )
          throw new Error(`incomplete meshes: ${result.stats.unreadable.join(', ')}`)
        return result
      }
      let result
      try {
        result = await convert(job.smc)
      } catch (error) {
        if (!job.fallbackSmc || !files.resolve(job.fallbackSmc)) throw error
        console.warn(`${job.id}: original unreadable; using ${job.fallbackSmc}`)
        result = await convert(job.fallbackSmc)
      }
      const { document, stats } = result
      const unexpectedMissing = stats.missing.filter(
        (file) => !args.allowedMissing?.get(job.id)?.has(file),
      )
      if (args.strict && (unexpectedMissing.length || stats.unreadable.length))
        throw new Error(
          `incomplete dependencies: ${[...unexpectedMissing, ...stats.unreadable].join(', ')}`,
        )
      stats.shaders.forEach((s) => shaders.add(s))
      document.setLogger(new Logger(Logger.Verbosity.ERROR))
      await document.transform(
        dedup(),
        prune(),
        weld(),
        resample(),
        meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
      )
      const outFile = path.join(args.out, `${job.id}.glb`)
      fs.mkdirSync(path.dirname(outFile), { recursive: true })
      await io.write(outFile, document)
      const size = (fs.statSync(outFile).size / 1024).toFixed(0)
      console.log(
        `ok    ${job.id}  ${size} KB  meshes ${stats.meshes}, bones ${stats.bones}, ` +
          `clips ${stats.animations.length}` +
          (stats.missing.length ? `  (missing: ${stats.missing.join(', ')})` : '') +
          (stats.unreadable.length
            ? `  (encrypted: ${stats.unreadable.length} — textures in plain colour, meshes left out)`
            : '') +
          (stats.flipped ? `  (turned: ${stats.flipped})` : ''),
      )
      converted++
    } catch (error) {
      console.error(`fail  ${job.id}  ${error instanceof Error ? error.message : error}`)
      failed++
    }
  }

  if (!args.smc && args.only?.has('ui')) {
    const parts = await buildUiParts(files)
    const dir = path.join(ROOT, 'public', 'ui', 'lc')
    fs.mkdirSync(dir, { recursive: true })
    for (const [name, image] of Object.entries(parts))
      fs.writeFileSync(path.join(dir, `${name}.webp`), image)
    console.log(
      `ui: ${Object.keys(parts).join(', ') || 'no interface atlases in the client folder(s)'}`,
    )
  }

  if (!args.smc && args.only?.has('terrain')) {
    for (const [map, def] of Object.entries(MAPS)) {
      if (args.map && args.map !== map) continue
      if (!files.resolve(def.wtr)) {
        console.log(`terrain ${map}: ${def.wtr} is not in the client folder(s)`)
        continue
      }
      // the world file's trees, walls and houses: hunting grounds keep clear of them
      const world = def.wld && files.resolve(def.wld) ? placedModels(files, def.wld).placed : []
      // a zone whose spawn table fits the terrain fights where its monsters spawn
      const spawned = def.spawnZone ? spawnGrounds(data, def.spawnZone) : null
      const out = await buildTerrain(files, def.wtr, {
        ...def,
        obstacles: obstacles(world),
        ...(spawned ? { arenas: spawned } : {}),
      })
      const dir = path.join(ROOT, 'public', 'maps', map)
      fs.mkdirSync(dir, { recursive: true })
      for (const [name, content] of Object.entries(out))
        fs.writeFileSync(path.join(dir, name), content)
      const { arenas } = JSON.parse(out['terrain.json'].toString())
      if (!spawned && arenas.length < def.count)
        throw new Error(`terrain ${map}: only ${arenas.length} of ${def.count} hunting grounds`)
      writeNav(files, map, def, world)
      console.log(
        `terrain ${map}: ${Object.keys(out).length} files, ${arenas.length} hunting grounds`,
      )
      if (world.length) {
        const props = await buildProps(files, def.wld, { arenas })
        await io.write(path.join(dir, 'props.glb'), props.document)
        fs.writeFileSync(path.join(dir, 'props.json'), JSON.stringify(props.json))
        const size = (fs.statSync(path.join(dir, 'props.glb')).size / 1024).toFixed(0)
        console.log(
          `props ${map}: ${props.json.models.length} models, ` +
            `${props.json.instances.length} placed, ${size} KB`,
        )
      }
    }
  }

  // `--only nav`: just the walkable grid (nav.bin) of each map, its terrain.json gets the entry
  if (!args.smc && args.only?.has('nav') && !args.only.has('terrain')) {
    for (const [map, def] of Object.entries(MAPS)) {
      if (args.map && args.map !== map) continue
      if (!files.resolve(def.wtr)) continue
      const world = def.wld && files.resolve(def.wld) ? placedModels(files, def.wld).placed : []
      writeNav(files, map, def, world)
    }
  }

  if (!args.smc && (!args.only || args.only.has('fx'))) {
    const textures = await buildFxTextures(files)
    const dir = path.join(ROOT, 'public', 'fx')
    fs.mkdirSync(dir, { recursive: true })
    for (const [name, image] of Object.entries(textures))
      fs.writeFileSync(path.join(dir, `${name}.webp`), image)
    console.log(
      `fx: ${Object.keys(textures).join(', ') || 'no effect textures in the client folder(s)'}`,
    )
  }

  if (data && !args.smc && (!args.only || args.only.has('icons'))) {
    // sheets whose atlases are not in these client folders stay as they are
    const manifestFile = path.join(GENERATED, 'lc-icons.json')
    const manifest = fs.existsSync(manifestFile)
      ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      : {}
    for (const kind of ICON_KINDS) {
      const entries = kind.entries(data)
      const { image, sheet, missingAtlases } = await buildIconSheet(
        files,
        entries,
        kind.atlasPath,
        kind.file,
      )
      if (!image) {
        console.warn(`icons: no ${kind.kind} atlases in the client folder(s)`)
        continue
      }
      const out = path.join(ROOT, 'public', kind.file)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, image)
      // a new sheet gets a new URL, so cached copies of the old one are never mixed with new positions
      const version = createHash('sha1').update(image).digest('hex').slice(0, 10)
      manifest[kind.kind] = { ...sheet, file: `${kind.file}?v=${version}` }
      console.log(
        `icons: ${kind.kind} ${Object.keys(sheet.icons).length} of ${entries.length}, ` +
          `${(image.length / 1024).toFixed(0)} KB` +
          (missingAtlases.length ? ` (missing atlases ${missingAtlases.join(', ')})` : ''),
      )
    }
    const portraits = await buildPortraitSheet(files, PORTRAITS_FILE)
    if (portraits.image) {
      const out = path.join(ROOT, 'public', PORTRAITS_FILE)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, portraits.image)
      const version = createHash('sha1').update(portraits.image).digest('hex').slice(0, 10)
      manifest.portraits = { ...portraits.sheet, file: `${PORTRAITS_FILE}?v=${version}` }
      console.log(`icons: class portraits ${Object.keys(portraits.sheet.icons).join(', ')}`)
    } else {
      console.warn('icons: no TopUI.tex (class portraits) in the client folder(s)')
    }
    if (Object.keys(manifest).length) {
      fs.mkdirSync(GENERATED, { recursive: true })
      fs.writeFileSync(manifestFile, JSON.stringify(manifest))
    }
  }

  // the manifest points the game at the default folder, so only that folder updates it
  if (data && args.out === DEFAULT_OUT && !iconsOnly) {
    const manifest = await buildModelManifest(data, args.out)
    fs.mkdirSync(GENERATED, { recursive: true })
    fs.writeFileSync(path.join(GENERATED, 'lc-models.json'), JSON.stringify(manifest, null, 2))
    console.log(`lc-models.json: ${manifest.models.length} models`)
    if (itemModels) {
      const gear = buildGearManifest(itemModels, args.out, data)
      const { standIns, ...manifest } = gear
      fs.writeFileSync(path.join(GENERATED, 'lc-gear.json'), JSON.stringify(manifest))
      console.log(
        `lc-gear.json: ${Object.keys(gear.models).length} weapon and armor models, ` +
          `${standIns} items shown with a stand-in`,
      )
    }
  }
  console.log(
    `\nDone: ${converted} converted, ${failed} failed -> ${path.relative(ROOT, args.out)}` +
      `\nshaders: ${[...shaders].sort().join(', ') || 'none'}`,
  )
  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
