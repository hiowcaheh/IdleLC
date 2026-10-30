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
import { parseSkillAnims } from './skill-anims.mjs'
import { parseSmc } from './smc.mjs'

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
    else if (flag === '--smc') args.smc = value()
    else if (flag === '--anims') args.anims = value().split(',')
    else if (flag === '--max-texture') args.maxTexture = Number(value())
    else if (flag === '--help' || flag === '-h') args.help = true
    else throw new Error(`unknown option ${flag}`)
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
    override: def.animSets ? { animSets: def.animSets } : undefined,
  }))
  const monsters = new Map()
  for (const m of data?.monsters ?? []) {
    const job = monsters.get(m.model) ?? { id: m.model, smc: m.smc, animations: new Set() }
    for (const clip of Object.values(m.animations).flat())
      if (clip) job.animations.add(String(clip))
    monsters.set(m.model, job)
  }
  let absent = 0
  for (const job of monsters.values()) {
    if (!files.resolve(job.smc)) {
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
  return jobs.filter(
    (j) =>
      args.only.has(j.id) ||
      (j.gear && args.only.has('gear')) ||
      (j.starter && args.only.has('starter')),
  )
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
  const anims = Object.fromEntries(
    parseSkillAnims(files.read('Data\\skills.lod'), data.skills, prefixes),
  )
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
  return { ...parseSmc(text), ...job.override }
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
  // `--only icons` / `--only ui` (or both) convert no models
  const iconsOnly =
    args.only !== undefined && [...args.only].every((o) => ['icons', 'ui', 'fx'].includes(o))
  const skillAnims = readSkillAnims(files, data)
  const jobs = iconsOnly
    ? []
    : listJobs(args, data, files, itemModels, await readItemIcons(), skillAnims)
  const textureCache = new Map()
  const shaders = new Set()
  let converted = 0
  let failed = 0
  for (const job of jobs) {
    try {
      const smc = readSmc(job, files)
      const options = {
        animations: job.animations,
        maxTextureSize: job.maxTextureSize ?? args.maxTexture,
        webp: job.webp,
        usedBonesOnly: job.usedBonesOnly,
        fallbackColor: job.fallbackColor?.(),
        textureCache,
      }
      let { document, stats } = await buildModel(files, smc, options)
      if (job.animations?.length && stats.animations.length === 0 && stats.bones > 0) {
        // none of the requested clip names exist: keep every clip rather than none
        ;({ document, stats } = await buildModel(files, smc, { ...options, animations: null }))
      }
      if (stats.meshes === 0) throw new Error(`no meshes (missing: ${stats.missing.join(', ')})`)
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
          (stats.unreadable.length ? `  (plain colour: ${stats.unreadable.length} encrypted)` : ''),
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
