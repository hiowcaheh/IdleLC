#!/usr/bin/env node
/** Recover the source particle subset used by the eff_name title family. */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ClientFiles } from './client.mjs'
import { parseTexture } from './texture.mjs'
import { normalizeAdditiveRgba } from './model.mjs'
import { readEffectGroups, readUpgradeEffect } from './upgrade-effects.mjs'
import { readParticleGroup } from './title-particles.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (data) => createHash('sha256').update(data).digest('hex')

function nameAt(buffer, at) {
  const end = buffer.indexOf(10, at + 5)
  if (end < 0 || end - at > 1024) throw new Error(`invalid name at ${at}`)
  return buffer
    .subarray(at + 5, end)
    .toString('latin1')
    .replace(/\r/g, '')
}

/** Strict record boundaries are checked after selecting source names, never guessed from colour. */
export function recoverTitleDefinitions(buffer, effectNames) {
  const all = readEffectGroups(buffer)
  const groups = Object.fromEntries(
    effectNames
      .filter((name) => /^eff_name/.test(name))
      .map((name) => {
        if (!all[name]) throw new Error(`missing title group ${name}`)
        return [name, all[name]]
      }),
  )
  const wanted = new Set(Object.values(groups).flatMap((group) => group.effects.map((e) => e.name)))
  const effects = {}
  const from = buffer.indexOf(Buffer.from('EEFM'))
  const until = buffer.indexOf(Buffer.from('EEGM'))
  if (from < 0 || until <= from) throw new Error('missing effect manager')
  const offsets = []
  for (
    let at = buffer.indexOf(Buffer.from('EFCT'), from);
    at >= 0 && at < until;
    at = buffer.indexOf(Buffer.from('EFCT'), at + 4)
  )
    offsets.push(at)
  for (let i = 0; i < offsets.length; i++) {
    const at = offsets[i]
    const name = nameAt(buffer, at)
    if (!wanted.has(name)) continue
    const { effect, bytesRead } = readUpgradeEffect(buffer, at)
    if (effect.kind !== 'EFPT') throw new Error(`non-particle title effect ${name}`)
    if (at + bytesRead !== (offsets[i + 1] ? offsets[i + 1] - 4 : until))
      throw new Error(`incomplete title effect ${name}`)
    effects[name] = effect
  }
  for (const name of wanted) if (!effects[name]) throw new Error(`missing title definition ${name}`)
  const particleNames = new Set(Object.values(effects).map((effect) => effect.particleGroup))
  const particles = {}
  const before = buffer.indexOf(Buffer.from('EEFM'))
  const particleOffsets = []
  for (
    let at = buffer.indexOf(Buffer.from('PTGR'));
    at >= 0 && at < before;
    at = buffer.indexOf(Buffer.from('PTGR'), at + 4)
  )
    particleOffsets.push(at)
  for (let i = 0; i < particleOffsets.length; i++) {
    const at = particleOffsets[i]
    const name = nameAt(buffer, at)
    if (!particleNames.has(name)) continue
    const { group, bytesRead } = readParticleGroup(buffer, at)
    // EPGM's PTGR records are adjacent; the final record precedes the EEFM marker.
    const end = particleOffsets[i + 1] ?? before
    if (at + bytesRead !== end)
      throw new Error(`incomplete title particles ${name}: ${at + bytesRead} != ${end}`)
    validateTitleParticle(group)
    particles[name] = group
  }
  for (const name of particleNames)
    if (!particles[name]) throw new Error(`missing title particles ${name}`)
  return { groups, effects, particles }
}

/** The renderer supports this actual source subset; other emitters/processes require a port. */
export function validateTitleParticle(group) {
  if (group.render !== 0 || ![203, 206].includes(group.blend))
    throw new Error(`unsupported title blend/render in ${group.name}`)
  const emitter = group.emitter
  if (
    !emitter ||
    emitter.kind !== 'cylinder' ||
    !emitter.local ||
    emitter.emitAllDirections ||
    !emitter.useShapePosition ||
    !emitter.useShapeSpeed
  )
    throw new Error(`unsupported title emitter ${group.name}`)
  if (
    !group.absorption ||
    group.absorption.kind !== 'default' ||
    group.absorption.move !== 4 ||
    !group.absorption.dependLife
  )
    throw new Error(`unsupported title absorption ${group.name}`)
  if (
    group.processes.some(
      (p) => p.kind !== 'dynamic' && !(p.kind === 'control' && p.type === 0 && p.angleSpeed === 0),
    )
  )
    throw new Error(`unsupported title process ${group.name}`)
  const state = group.processes.find((p) => p.kind === 'dynamic')
  if (
    !state ||
    state.color.length ||
    state.texPos.length ||
    state.mass.length ||
    state.deltaPos.length ||
    state.angle.some((sample) => sample.value[1] !== 0 || sample.value[2] !== 0) ||
    state.twinkle !== 0
  )
    throw new Error(`unsupported dynamic title track ${group.name}`)
  if (
    emitter.countPerSecond <= 0 ||
    emitter.particle.life[0] <= 0 ||
    emitter.particle.life[1] < emitter.particle.life[0]
  )
    throw new Error(`invalid title lifespan ${group.name}`)
}

async function main(argv) {
  const clients = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client' && argv[i + 1]) clients.push(path.resolve(argv[++i]))
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!clients.length) throw new Error('Usage: recover-title-fx --client <2015 client>')
  const files = new ClientFiles(clients)
  const source = files.read('Data\\Effect\\Effect.dat')
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/data/generated/lc-data.json')))
  const names = [
    ...new Set(
      data.titles.map((title) => title.effect).filter((name) => name?.startsWith('eff_name')),
    ),
  ]
  const definitions = recoverTitleDefinitions(source, names)
  const out = path.join(ROOT, 'public/fx/titles')
  fs.mkdirSync(out, { recursive: true })
  const textures = {}
  for (const particle of Object.values(definitions.particles)) {
    const id = `${path.basename(particle.texture.replace(/\\/g, '/'), '.tex').toLowerCase()}-${particle.blend === 206 ? 'add' : 'alpha'}`
    if (!textures[id]) {
      const texture = parseTexture(files.read(particle.texture))
      const rgba = particle.blend === 206 ? normalizeAdditiveRgba(texture.rgba) : texture.rgba
      const encoded = await sharp(Buffer.from(rgba), {
        raw: { width: texture.width, height: texture.height, channels: 4 },
      })
        .webp({ lossless: true })
        .toBuffer()
      fs.writeFileSync(path.join(out, `${id}.webp`), encoded)
      textures[id] = {
        source: particle.texture,
        url: `fx/titles/${id}.webp`,
        sha256: hash(encoded),
        width: texture.width,
        height: texture.height,
      }
    }
    particle.textureAsset = id
  }
  const json = {
    source: { path: 'Data/Effect/Effect.dat', sha256: hash(source) },
    adapter: 'title-cylinder-particles-v1',
    ...definitions,
    textures,
  }
  fs.writeFileSync(
    path.join(ROOT, 'src/game/data/generated/lc-title-effects.json'),
    JSON.stringify(json, null, 2) + '\n',
  )
  console.log(
    `Recovered ${names.length} title groups, ${Object.keys(definitions.particles).length} particle systems and ${Object.keys(textures).length} textures`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
