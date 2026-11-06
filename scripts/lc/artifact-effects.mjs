#!/usr/bin/env node
/** Recover Seraphim's six animated wing layers, selected by CItemEffect::AddRelicEffect. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { ClientFiles } from './client.mjs'
import { buildModel } from './model.mjs'
import { parseSmc } from './smc.mjs'
import { recoverUpgradeDefinitions } from './upgrade-effects.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (data) => createHash('sha256').update(data).digest('hex')

export function recoverArtifactWings(buffer) {
  const recovered = recoverUpgradeDefinitions(buffer, ['Angel_wing03'])
  const group = recovered.groups.Angel_wing03
  if (!group) throw new Error('missing Seraphim wing group')
  const wings = group.effects.flatMap((key, index) => {
    const effect = recovered.effects[key.name]
    if (effect.kind !== 'EFSK') return []
    const tag = group.tags.filter((t) => t.effect === index)
    if (
      tag.length !== 1 ||
      tag[0].name !== 'CENTER' ||
      tag[0].time !== 0 ||
      effect.position !== 2 ||
      effect.rotation !== 2 ||
      effect.repeat !== -1 ||
      effect.fadeIn !== 0 ||
      effect.fadeOut !== 0 ||
      !effect.control ||
      effect.control.alpha.length > 1 ||
      effect.control?.color.length ||
      effect.control?.twinkle ||
      effect.control?.fadeIn ||
      effect.control?.fadeOut
    )
      throw new Error(`unsupported wing attachment/control: ${key.name}`)
    return [{ name: key.name, delay: key.time, tag: tag[0].name }]
  })
  if (wings.length !== 6) throw new Error(`expected six source wing layers, found ${wings.length}`)
  return { ...recovered, wings }
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== '--client')
    throw new Error('Usage: recover-artifact-fx --client <2015 client>')
  const files = new ClientFiles([path.resolve(argv[1])])
  const source = files.read('Data\\Effect\\Effect.dat')
  const recovered = recoverArtifactWings(source)
  const out = path.join(ROOT, 'public/fx/artifact')
  fs.mkdirSync(out, { recursive: true })
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const models = {}
  for (const wing of recovered.wings) {
    const source = recovered.effects[wing.name].model
    if (models[source]) continue
    const id = path.win32.basename(source, '.smc').toLowerCase()
    const smc = parseSmc(files.read(source).toString('latin1'))
    const { document, stats } = await buildModel(files, smc, { webp: true, unlit: true })
    if (stats.missing.length || stats.unreadable.length || stats.animations.length !== 1)
      throw new Error(`incomplete animated wings: ${source}: ${JSON.stringify(stats)}`)
    const glb = await io.writeBinary(document)
    fs.writeFileSync(path.join(out, `${id}.glb`), glb)
    models[source] = {
      url: `fx/artifact/${id}.glb`,
      sha256: hash(glb),
      sourceSha256: hash(files.read(source)),
    }
  }
  const data = {
    source: { path: 'Data/Effect/Effect.dat', sha256: hash(source) },
    adapter: 'seraphim-ska-wings-v1',
    ...recovered,
    models,
  }
  fs.writeFileSync(
    path.join(ROOT, 'src/game/data/generated/lc-artifact-effects.json'),
    JSON.stringify(data, null, 2) + '\n',
  )
  console.log(
    `Recovered ${recovered.wings.length} animated Seraphim wing layers, ${Object.keys(models).length} models`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
