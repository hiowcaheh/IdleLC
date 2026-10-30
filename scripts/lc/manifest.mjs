/**
 * Builds the LC model manifest (src/game/data/generated/lc-models.json) for the converted GLBs:
 * logical animation → clip names (from the database motions or CLASS_MODELS), attack impact time
 * and bind-pose size; and the gear manifest (lc-gear.json): weapon and armor model → item ids.
 * File names carry a content hash (`?v=`), so a new conversion is never mixed with cached copies.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { getBounds } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'
import { CLASS_MODELS } from './classes.mjs'

export const MODELS_BASE_URL = 'models/lc/'
export const GEAR_DIR = 'gear'

/** `name.glb?v=<content hash>` for a converted file. */
const versioned = (full, file) =>
  `${file}?v=${createHash('sha1').update(fs.readFileSync(full)).digest('hex').slice(0, 10)}`

/** Model id from an .smc path (`Data\monster\Animals\Fox.smc` → `fox`). */
export const modelIdFromSmc = (smc) =>
  String(smc)
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.smc$/i, '')
    .toLowerCase()

/** Model id → logical animation map, for the classes and every monster model in the data. */
export function wantedModels(data) {
  const wanted = new Map(Object.entries(CLASS_MODELS).map(([id, def]) => [id, def.animations]))
  for (const m of data?.monsters ?? []) if (!wanted.has(m.model)) wanted.set(m.model, m.animations)
  return wanted
}

export async function buildModelManifest(data, modelsDir) {
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })

  const models = []
  for (const [id, animationMap] of wantedModels(data)) {
    const file = `${id}.glb`
    const full = path.join(modelsDir, file)
    if (!fs.existsSync(full)) continue
    const doc = await io.read(full)
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
    const { min, max } = getBounds(scene)
    // clip names in the database and in the .ba files sometimes differ in letter case
    const clips = new Map(
      doc
        .getRoot()
        .listAnimations()
        .map((a) => [a.getName().toLowerCase(), a]),
    )
    const clipName = (name) => (name ? clips.get(String(name).toLowerCase())?.getName() : undefined)
    const duration = (name) =>
      Math.max(
        0,
        ...(clips
          .get(name.toLowerCase())
          ?.listSamplers()
          .map((s) => s.getInput().getMax([0])[0]) ?? [0]),
      )
    const animations = {}
    for (const [key, value] of Object.entries(animationMap)) {
      // several attack clips play in turn; keep the ones the model has
      const names = [...new Set([value].flat().map(clipName).filter(Boolean))]
      if (names.length) animations[key] = Array.isArray(value) ? names : names[0]
    }
    const attacks = [animations.attack ?? []].flat()
    for (const required of ['idle', 'run', 'attack', 'die']) {
      if (!animations[required]) console.warn(`  ${id}: missing "${required}" clip`)
    }
    models.push({
      id,
      file: versioned(full, file),
      scale: 1,
      animations,
      // the blow lands roughly 40% into the attack clip
      attackImpact: attacks.length ? Math.min(0.6, duration(attacks[0]) * 0.4) : 0.4,
      height: max[1] - min[1],
      radius: Math.max(max[0] - min[0], max[2] - min[2]) / 2,
      tint: {},
    })
  }
  return { baseUrl: MODELS_BASE_URL, models }
}

/**
 * Weapon and armor models converted into `<modelsDir>/gear/`: model name → versioned file and the
 * item ids that wear it.
 */
export function buildGearManifest(itemModels, modelsDir) {
  const models = {}
  for (const [smc, items] of Object.entries(itemModels)) {
    const name = modelIdFromSmc(smc)
    const full = path.join(modelsDir, GEAR_DIR, `${name}.glb`)
    if (fs.existsSync(full)) models[name] = { file: versioned(full, `${name}.glb`), items }
  }
  return { baseUrl: `${MODELS_BASE_URL}${GEAR_DIR}/`, models }
}
