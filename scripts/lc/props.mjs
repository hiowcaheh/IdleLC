/**
 * The models a map's world file places — trees, grass, fences, walls, houses (scripts/lc/world.mjs)
 * — for the game (public/maps/<map>/): props.glb with every model under a node named by its id, and
 * props.json with the placements. The game draws the ones near the hunting ground as instances.
 */
import { Document, Logger } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import { dedup, mergeDocuments, meshopt, prune, unpartition, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { modelIdFromSmc } from './manifest.mjs'
import { buildModel } from './model.mjs'
import { parseSmc } from './smc.mjs'
import { parseWorldModels } from './world.mjs'

/** Placed models the game leaves out: the sky (it draws its own) and the editor's axis marker. */
const LEFT_OUT = /\\skybox\\|\\axis\.smc$/i
/** Longest texture side of the props (WebP): they are many, and seen from the hunting ground. */
const PROP_TEXTURE = 256
/** Props lower than this (metres) are grass and flowers: the fight may stand on them. */
export const LOW_PROP = 2.2
/**
 * Props this far (metres) from the hunting grounds and the runs between neighbouring ones are left
 * out: the fog hides them (the town, the far side of the map).
 */
const PROP_REACH = 125

/** Is (x, z) within `reach` of the path through `points` (or of a lone point)? */
function nearPath(points, x, z, reach) {
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]
    const [bx, bz] = points[i + 1] ?? points[i]
    const dx = bx - ax
    const dz = bz - az
    const length = dx * dx + dz * dz
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0
    if (Math.hypot(ax + dx * t - x, az + dz * t - z) <= reach) return true
  }
  return false
}

const round = (value, digits) => {
  const k = 10 ** digits
  return Math.round(value * k) / k || 0
}

/**
 * Placed models with their .smc read: { smc, id, x, y, z, heading, pitch, banking, stretch, box }
 * — `box` the model's size [x, y, z] in metres with its stretch (null when the .smc has none).
 * Models missing from the client folder(s) are left out.
 */
export function placedModels(files, wldPath) {
  const smcs = new Map()
  const placed = []
  for (const model of parseWorldModels(files.read(wldPath))) {
    if (LEFT_OUT.test(model.smc)) continue
    const key = model.smc.toLowerCase()
    if (!smcs.has(key)) {
      smcs.set(
        key,
        files.resolve(model.smc) ? parseSmc(files.read(model.smc).toString('latin1')) : null,
      )
    }
    const smc = smcs.get(key)
    if (!smc) continue
    const b = smc.bbox
    const box = b && [0, 1, 2].map((k) => (b[k + 3] - b[k]) * Math.abs(model.stretch[k]))
    placed.push({ ...model, id: modelIdFromSmc(model.smc), box })
  }
  return { placed, smcs }
}

/**
 * Things the fight can't stand in (trees, walls, houses): [x, z, radius] in map metres, for
 * pickArenas.
 */
export const obstacles = (placed) =>
  placed
    .filter((p) => p.box && p.box[1] >= LOW_PROP)
    .map((p) => [p.x, p.z, Math.hypot(p.box[0], p.box[2]) / 2])

/**
 * props.glb + props.json of a map (only the props near `arenas`, the hunting grounds in spot order). props.json: `models` (node names in props.glb, `low`: grass the
 * fight may stand on) and `instances` [model, x, y, z, heading, pitch, banking, stretch…] — the
 * stretch one number when even, else three; angles in degrees (Serious Engine: heading about +Y,
 * then pitch about X, then banking about Z).
 */
export async function buildProps(files, wldPath, { arenas, log = console.log }) {
  const { placed: all, smcs } = placedModels(files, wldPath)
  const placed = all.filter((p) => nearPath(arenas, p.x, p.z, PROP_REACH))
  const used = new Set(placed.map((p) => p.smc.toLowerCase()))
  const target = new Document()
  target.setLogger(new Logger(Logger.Verbosity.ERROR))
  target.createExtension(EXTTextureWebP).setRequired(true)
  const scene = target.createScene('props')
  target.getRoot().setDefaultScene(scene)
  const textureCache = new Map()
  const models = []
  const indexOf = new Map()
  const failed = []
  for (const [key, smc] of smcs) {
    if (!smc || !used.has(key)) continue
    const id = modelIdFromSmc(key)
    if (indexOf.has(id)) continue
    try {
      // still models: no skeleton (swaying grass, fish and windmill sails stand in their rest pose)
      const { document, stats } = await buildModel(
        files,
        { ...smc, skeleton: null, animSets: [] },
        { animations: [], maxTextureSize: PROP_TEXTURE, webp: true, cutout: true, textureCache },
      )
      if (stats.meshes === 0) throw new Error('no readable meshes')
      const copies = mergeDocuments(target, document)
      const holder = target.createNode(id).setTranslation(smc.offset.slice(0, 3))
      for (const source of document.getRoot().listScenes()) {
        const copy = copies.get(source)
        for (const child of copy.listChildren()) {
          copy.removeChild(child)
          holder.addChild(child)
        }
        copy.dispose()
      }
      scene.addChild(holder)
      const box = smc.bbox
      models.push({ id, low: box ? box[4] - box[1] < LOW_PROP : false })
      indexOf.set(id, models.length - 1)
    } catch (error) {
      failed.push(`${id} (${error instanceof Error ? error.message : error})`)
    }
  }
  await target.transform(
    unpartition(),
    dedup(),
    prune(),
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  const instances = []
  for (const p of placed) {
    const model = indexOf.get(p.id)
    if (model === undefined) continue
    const stretch = p.stretch.map((s) => round(s, 3))
    instances.push([
      model,
      round(p.x, 2),
      round(p.y, 2),
      round(p.z, 2),
      round(p.heading, 1),
      round(p.pitch, 1),
      round(p.banking, 1),
      ...(stretch[0] === stretch[1] && stretch[1] === stretch[2] ? [stretch[0]] : stretch),
    ])
  }
  if (failed.length) log(`props: left out ${failed.length} models: ${failed.join(', ')}`)
  return { document: target, json: { models, instances } }
}
