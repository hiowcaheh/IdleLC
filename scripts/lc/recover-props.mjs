#!/usr/bin/env node
/**
 * Append readable world props without replacing existing geometry, materials or placements.
 * Unlike --only terrain this command reuses the map's committed hunting grounds and never writes
 * terrain heights, textures, masks or arenas.
 *
 * npm run recover-lc-props -- --client <client folder> [--map juno] [--out <staging directory>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { copyToDocument } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import { ClientFiles } from './client.mjs'
import { buildProps } from './props.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WORLDS = { juno: 'Data\\World\\StartZone\\startzone.wld' }

/** Validate before mutating either document: malformed indices must not silently move props. */
function validateManifest(document, manifest, label) {
  if (!Array.isArray(manifest.models) || !Array.isArray(manifest.instances))
    throw new Error(`${label}: invalid props manifest`)
  const scene = document.getRoot().getDefaultScene()
  if (!scene) throw new Error(`${label}: missing default scene`)
  const nodes = new Map(scene.listChildren().map((node) => [node.getName(), node]))
  const ids = new Set()
  for (const model of manifest.models) {
    if (!model.id || ids.has(model.id) || !nodes.has(model.id))
      throw new Error(`${label}: missing or duplicate model ${model.id}`)
    ids.add(model.id)
  }
  for (const instance of manifest.instances) {
    if (
      !Array.isArray(instance) ||
      ![8, 10].includes(instance.length) ||
      !instance.every(Number.isFinite) ||
      !Number.isInteger(instance[0]) ||
      instance[0] < 0 ||
      instance[0] >= manifest.models.length
    )
      throw new Error(`${label}: invalid prop placement`)
  }
  return { scene, nodes, ids }
}

const placementKey = (manifest, [index, ...transform]) =>
  JSON.stringify([manifest.models[index].id, ...transform])

/**
 * Add only previously absent model IDs and their placements. Existing model objects and instances
 * are kept verbatim, including their order, indices and material/texture identities. Recovered
 * placements must contain every existing placement, including duplicate counts: this catches an
 * incompatible world file or changed hunting grounds before anything is written.
 */
export function appendRecoveredProps(existingDocument, existing, recoveredDocument, recovered) {
  const old = validateManifest(existingDocument, existing, 'existing')
  const fresh = validateManifest(recoveredDocument, recovered, 'recovered')
  const remaining = new Map()
  for (const instance of recovered.instances) {
    const key = placementKey(recovered, instance)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  }
  for (const instance of existing.instances) {
    const key = placementKey(existing, instance)
    const count = remaining.get(key) ?? 0
    if (!count) throw new Error(`recovered world does not preserve existing placement ${key}`)
    remaining.set(key, count - 1)
  }

  const additions = recovered.models.filter((model) => !old.ids.has(model.id))
  if (!additions.length)
    return { document: existingDocument, json: existing, addedModels: 0, addedInstances: 0 }
  const addedIds = new Set(additions.map((model) => model.id))
  const sourceNodes = additions.map((model) => fresh.nodes.get(model.id))
  for (const extension of recoveredDocument.getRoot().listExtensionsUsed()) {
    const target = existingDocument.createExtension(extension.constructor)
    if (extension.isRequired()) target.setRequired(true)
  }
  const copies = copyToDocument(existingDocument, recoveredDocument, sourceNodes)
  for (const node of sourceNodes) old.scene.addChild(copies.get(node))

  // GLB has a single buffer. Move only new accessors to it; existing geometry is never transformed.
  const buffer = existingDocument.getRoot().listBuffers()[0] ?? existingDocument.createBuffer()
  for (const copy of copies.values()) if (copy.propertyType === 'Accessor') copy.setBuffer(buffer)
  for (const copy of copies.values())
    if (copy.propertyType === 'Buffer' && copy !== buffer) copy.dispose()

  const models = [...existing.models, ...additions]
  const indexOf = new Map(models.map((model, index) => [model.id, index]))
  const extra = recovered.instances
    .filter(([index]) => addedIds.has(recovered.models[index].id))
    .map(([index, ...transform]) => [indexOf.get(recovered.models[index].id), ...transform])
  return {
    document: existingDocument,
    json: { models, instances: [...existing.instances, ...extra] },
    addedModels: additions.length,
    addedInstances: extra.length,
  }
}

async function main(argv) {
  const args = { clients: [], map: 'juno' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--help' || flag === '-h') {
      console.log(
        'Usage: node scripts/lc/recover-props.mjs --client <folder> [--map juno] [--out <folder>] [--source-world <path>]',
      )
      return
    }
    const value = argv[++i]
    if (!value) throw new Error(`${flag} needs a value`)
    if (flag === '--client') args.clients.push(path.resolve(value))
    else if (flag === '--map') args.map = value
    else if (flag === '--out') args.out = path.resolve(value)
    else if (flag === '--source-world') args.world = value
    else throw new Error(`unknown option ${flag}`)
  }
  if (!args.clients.length) throw new Error('--client is required')
  if (!Object.hasOwn(WORLDS, args.map)) throw new Error(`unsupported map ${args.map}`)
  const dir = path.join(ROOT, 'public', 'maps', args.map)
  const out = args.out ?? dir
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'terrain.json'), 'utf8'))
  const existing = JSON.parse(fs.readFileSync(path.join(dir, 'props.json'), 'utf8'))
  const files = new ClientFiles(args.clients)
  await MeshoptDecoder.ready
  await MeshoptEncoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  })
  const existingDocument = await io.read(path.join(dir, 'props.glb'))
  const recovered = await buildProps(files, args.world ?? WORLDS[args.map], { arenas: meta.arenas })
  const result = appendRecoveredProps(
    existingDocument,
    existing,
    recovered.document,
    recovered.json,
  )
  if (!result.addedModels) {
    console.log(`${args.map}: no new props; existing files kept`)
    return
  }
  fs.mkdirSync(out, { recursive: true })
  const glbTemp = path.join(out, `.props-${process.pid}.glb`)
  const jsonTemp = path.join(out, `.props-${process.pid}.json`)
  try {
    await io.write(glbTemp, result.document)
    fs.writeFileSync(jsonTemp, JSON.stringify(result.json))
    fs.renameSync(glbTemp, path.join(out, 'props.glb'))
    fs.renameSync(jsonTemp, path.join(out, 'props.json'))
  } finally {
    for (const file of [glbTemp, jsonTemp]) if (fs.existsSync(file)) fs.unlinkSync(file)
  }
  console.log(
    `${args.map}: +${result.addedModels} models, +${result.addedInstances} placements; existing props and terrain kept`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
