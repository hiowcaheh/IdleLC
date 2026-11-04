#!/usr/bin/env node
/**
 * Recover the upgrade subset of Effect.dat. This is a bounded adapter, not a complete LC FX
 * engine. Layouts: CEffect, CSkaEffect, CSplinePathEffect, CParticleEffect, CTraceEffect and
 * CEffectGroup serializers in the November 2018 client. Raw archives never enter the repository.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { Reader } from './binary.mjs'
import { ClientFiles } from './client.mjs'
import { buildModel, inverseBindMatrix, normalizeAdditiveRgba } from './model.mjs'
import { parseSmc } from './smc.mjs'
import { parseTexture } from './texture.mjs'
import { parseMesh } from './mesh.mjs'
import { parseSkeleton } from './ska.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const hash = (data) => createHash('sha256').update(data).digest('hex')
const expect = (r, id) => {
  if (r.id() !== id) throw new Error(`expected ${id} at ${r.o - 4}`)
}
const version = (r, accepted) => {
  const v = r.u8()
  if (!accepted.includes(v)) throw new Error(`unsupported record version ${v} at ${r.o - 1}`)
  return v
}
const count = (r, minBytes = 1) => {
  const n = r.u32()
  if (n > 100000 || n > r.remaining / minBytes) throw new Error(`invalid count ${n} at ${r.o - 4}`)
  return n
}
function line(r) {
  const at = r.buf.indexOf(10, r.o)
  if (at < 0 || at - r.o > 1023) throw new Error(`invalid line at ${r.o}`)
  const value = r
    .bytes(at - r.o + 1)
    .toString('latin1')
    .replace(/[\r\n]/g, '')
  return value
}
function finite(r) {
  const value = r.f32()
  if (!Number.isFinite(value)) throw new Error(`non-finite effect value at ${r.o - 4}`)
  return value
}
const vec3 = (r) => [finite(r), finite(r), finite(r)]
/** CTFileName includes the dependency marker when no stream dictionary is active. */
function fileName(r) {
  expect(r, 'DFNM')
  return r.string()
}
function samples(r, readValue) {
  const out = Array.from({ length: count(r, 5) }, () => ({ time: finite(r), value: readValue(r) }))
  if (out.some((s, i) => s.time < 0 || (i > 0 && s.time < out[i - 1].time)))
    throw new Error('invalid effect sample timeline')
  return out
}
function control(r) {
  expect(r, 'ECTL')
  version(r, [1])
  const out = { twinkle: finite(r), fadeIn: finite(r), fadeOut: finite(r) }
  for (const [name, read] of [
    ['color', (r) => r.u32()],
    ['alpha', (r) => r.u8()],
    ['stretch', vec3],
    ['position', vec3],
    ['angle', vec3],
  ])
    out[name] = r.i32() ? samples(r, read) : []
  return out
}

/** Decode one supported record from an already validated EFCT boundary. */
export function readUpgradeEffect(buffer, offset = 0) {
  const r = new Reader(buffer, offset)
  expect(r, 'EFCT')
  const v = version(r, [1, 2])
  const out = {
    name: line(r),
    lifeTime: finite(r),
    repeat: r.i32(),
    fadeIn: finite(r),
    fadeOut: finite(r),
  }
  if (v >= 2) out.boundingRadius = finite(r)
  out.kind = r.id()
  if (out.kind === 'EFSK') {
    const v = version(r, [2, 3])
    out.model = fileName(r)
    out.color = r.u32()
    out.stretch = vec3(r)
    out.position = v >= 3 ? r.u32() : 0
    out.rotation = r.u32()
    out.control = r.i32() ? control(r) : null
  } else if (out.kind === 'EFMD') {
    const v = version(r, [3, 4])
    out.model = fileName(r)
    out.texture = fileName(r)
    out.color = r.u32()
    out.stretch = vec3(r)
    out.rotation = r.u32()
    out.position = v >= 4 ? r.u32() : 0
    out.control = r.i32() ? control(r) : null
    out.overDraw = Boolean(r.i32())
  } else if (out.kind === 'EFSP') {
    const v = version(r, [1, 2])
    out.rotation = r.i32()
    out.position = r.i32()
    out.paths = Array.from({ length: count(r) }, () => ({
      samples: samples(r, vec3),
      effect: r.string(),
    }))
    out.offset = v >= 2 ? vec3(r) : [0, 0, 0]
  } else if (out.kind === 'EFPT') {
    const v = version(r, [1, 2])
    out.particleGroup = line(r)
    out.rotation = v >= 2 ? r.u32() : 0
  } else if (out.kind === 'EFTC') {
    const v = version(r, [3, 4])
    out.texture = fileName(r)
    out.colorBegin = r.u32()
    out.colorEnd = r.u32()
    out.traceTime = finite(r)
    out.interval = finite(r)
    out.twinkle = finite(r)
    out.capEnd = Boolean(r.i32())
    out.blend = v >= 4 ? r.i32() : null
  } else throw new Error(`unsupported upgrade effect ${out.name}: ${out.kind}`)
  return { effect: out, bytesRead: r.o - offset }
}

/** Full terminal group section, with signed tag indices and strict EOF. */
export function readEffectGroups(buffer) {
  const start = buffer.indexOf(Buffer.from('EEGM'))
  if (start < 0 || buffer.indexOf(Buffer.from('EEGM'), start + 4) >= 0)
    throw new Error('expected one EEGM section')
  const r = new Reader(buffer, start)
  expect(r, 'EEGM')
  expect(r, 'EGMG')
  version(r, [1])
  const groups = {}
  for (let i = 0, n = count(r); i < n; i++) {
    expect(r, 'EFGR')
    version(r, [1])
    const name = line(r)
    if (!name || groups[name]) throw new Error(`duplicate or empty group ${name}`)
    expect(r, 'EGEK')
    const effects = Array.from({ length: count(r, 5) }, () => ({ time: r.f32(), name: line(r) }))
    expect(r, 'EGTK')
    const tags = Array.from({ length: count(r, 9) }, () => ({
      time: r.f32(),
      effect: r.i32(),
      name: line(r),
    }))
    if (tags.some((t) => t.effect < 0 || t.effect >= effects.length))
      throw new Error(`invalid effect key in ${name}`)
    if ([...effects, ...tags].some((k) => !Number.isFinite(k.time) || k.time < 0))
      throw new Error(`invalid timeline in ${name}`)
    expect(r, 'EGEN')
    groups[name] = { effects, tags }
  }
  expect(r, 'EFTE')
  if (r.remaining) throw new Error(`unexpected trailing group data: ${r.remaining}`)
  return groups
}

/**
 * Find EFCT boundaries only inside EEFM. Each selected record is decoded and must end exactly at
 * the next boundary's type word. Unrelated record bodies remain explicitly unsupported.
 */
export function recoverUpgradeDefinitions(buffer, groupNames = null) {
  const allGroups = readEffectGroups(buffer)
  const groups = Object.fromEntries(
    Object.entries(allGroups).filter(([name]) =>
      groupNames
        ? groupNames.includes(name)
        : /^(?:ia_t|ia_k|i_hw|i_ma|ih_ro|so)_(?:wp2?|am)_[1-6]$/.test(name),
    ),
  )
  const from = buffer.indexOf(Buffer.from('EEFM'))
  const until = buffer.indexOf(Buffer.from('EEGM'))
  if (from < 0 || until <= from) throw new Error('missing effect manager section')
  const boundaries = []
  const lookup = new Map()
  for (
    let at = buffer.indexOf(Buffer.from('EFCT'), from);
    at >= 0 && at < until;
    at = buffer.indexOf(Buffer.from('EFCT'), at + 4)
  ) {
    const r = new Reader(buffer, at + 4)
    if (![1, 2].includes(r.u8())) throw new Error(`invalid EFCT boundary ${at}`)
    const name = line(r)
    if (!name || lookup.has(name)) throw new Error(`invalid effect name ${name}`)
    lookup.set(name, boundaries.length)
    boundaries.push({ at, name })
  }
  const effects = {}
  const visit = (name) => {
    if (effects[name]) return
    const i = lookup.get(name)
    if (i === undefined) throw new Error(`missing definition ${name}`)
    const { at } = boundaries[i]
    const { effect, bytesRead } = readUpgradeEffect(buffer, at)
    const end = boundaries[i + 1]?.at - 4 || until
    if (at + bytesRead !== end)
      throw new Error(`incomplete definition ${name}: ${at + bytesRead} != ${end}`)
    effects[name] = effect
    for (const p of effect.paths ?? []) visit(p.effect)
  }
  for (const g of Object.values(groups)) for (const e of g.effects) visit(e.name)
  return { groups, effects, totalGroups: Object.keys(allGroups).length }
}

/** Mesh.cpp:2435–2535 creates tags from the first vertex of _TAG_T/_TAG_G surfaces. */
export function sourceMeshTags(lod) {
  const tags = {}
  for (const surface of lod.surfaces) {
    const match = /^_TAG_([TG])_(.+)$/.exec(surface.name)
    if (!match || surface.count === 0) continue
    let name = match[2]
    if (match[1] === 'G') {
      if (!/^[012]_/.test(name)) continue
      name = `__${name}`
    }
    const vertex = surface.first
    const weights = lod.weightMaps
      .flatMap((map) => {
        const index = Array.prototype.indexOf.call(map.vertices, vertex)
        return index >= 0 && map.weights[index] > 0
          ? [{ bone: map.bone, weight: map.weights[index] }]
          : []
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)
    tags[name] = {
      position: Array.from(lod.positions.slice(vertex * 3, vertex * 3 + 3)),
      normal: Array.from(lod.normals.slice(vertex * 3, vertex * 3 + 3)),
      weights,
    }
  }
  return tags
}

export function recoverSourceTags(files, smcPath) {
  const smc = parseSmc(files.read(smcPath).toString('latin1'))
  const tags = {}
  for (const mesh of smc.meshes) {
    if (!/^_tag/i.test(path.win32.basename(mesh.file)) || !files.resolve(mesh.file)) continue
    Object.assign(tags, sourceMeshTags(parseMesh(files.read(mesh.file)).lods[0]))
  }
  return tags
}

function recoverAttachmentTags(files) {
  const characterTags = {}
  const skeletons = {}
  for (const [id, directory, prefix] of [
    ['titan', 'Titan', 'ti'],
    ['knight', 'Knight', 'ni'],
    ['healer', 'Healer', 'hw'],
    ['mage', 'Mage', 'ma'],
    ['rogue', 'Rogue', 'ro'],
    ['sorcerer', 'Sorcerer', 'so'],
  ]) {
    characterTags[id] = recoverSourceTags(files, `Data\\Character\\${directory}\\${prefix}.smc`)
    const smc = parseSmc(
      files.read(`Data\\Character\\${directory}\\${prefix}.smc`).toString('latin1'),
    )
    skeletons[id] = parseSkeleton(files.read(smc.skeleton)).lods[0].bones
    for (const name of ['CENTER', 'HEAD', 'LHAND', 'RHAND'])
      if (!characterTags[id][name]) throw new Error(`missing ${id} source tag ${name}`)
  }
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/game/data/generated/lc-data.json')))
  const weapons = new Set(data.items.filter((item) => item.type === 0).map((item) => item.id))
  const sources = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/game/data/generated/lc-item-models.json')),
  )
  const weaponTags = {}
  for (const [source, ids] of Object.entries(sources)) {
    if (!ids.some((id) => weapons.has(id)) || !files.resolve(source)) continue
    const tags = recoverSourceTags(files, source)
    if (Object.keys(tags).length)
      weaponTags[path.win32.basename(source, '.smc').toLowerCase()] = tags
  }
  const usedBones = new Set(
    [...Object.values(characterTags), ...Object.values(weaponTags)].flatMap((tags) =>
      Object.values(tags).flatMap((tag) => tag.weights.map((w) => w.bone)),
    ),
  )
  const tagBindInverses = Object.fromEntries(
    Object.entries(skeletons).map(([id, bones]) => [
      id,
      Object.fromEntries(
        bones
          .filter((bone) => usedBones.has(bone.name))
          .map((bone) => [bone.name, inverseBindMatrix(bone.abs)]),
      ),
    ]),
  )
  return { characterTags, weaponTags, tagBindInverses }
}

async function main(argv) {
  const clients = []
  let models = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') clients.push(path.resolve(argv[++i]))
    else if (argv[i] === '--models') models = true
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!clients.length)
    throw new Error('Usage: recover-upgrade-fx --client <2015 client> [--models]')
  const files = new ClientFiles(clients)
  const source = files.read('Data\\Effect\\Effect.dat')
  const definitions = recoverUpgradeDefinitions(source)
  if (Object.keys(definitions.groups).length !== 108)
    throw new Error('expected all 108 class/weapon/armor upgrade groups')
  const out = path.join(ROOT, 'public/fx')
  fs.mkdirSync(path.join(out, 'models'), { recursive: true })
  const assets = { models: {}, textures: {} }
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const paths = [
    ...new Set(
      Object.values(definitions.effects)
        .filter((e) => e.kind === 'EFSK')
        .map((e) => e.model),
    ),
  ]
  for (const source of paths) {
    const id = path.basename(source.replace(/\\/g, '/'), '.smc').toLowerCase()
    const target = path.join(out, 'models', `${id}.glb`)
    if (models || !fs.existsSync(target)) {
      const smc = parseSmc(files.read(source).toString('latin1'))
      const { document, stats } = await buildModel(files, smc, { webp: true, unlit: true })
      if (stats.missing.length || stats.unreadable.length)
        throw new Error(`incomplete model ${source}: ${JSON.stringify(stats)}`)
      fs.writeFileSync(target, await io.writeBinary(document))
    }
    assets.models[source] = { url: `fx/models/${id}.glb`, sha256: hash(fs.readFileSync(target)) }
  }
  for (const [id, source] of [
    ['plus-glow', 'Data\\Effect\\Texture\\Common_weapon_plus_glow.tex'],
    ['plus-particle', 'Data\\Effect\\Particle\\FX_p_yellow.tex'],
  ]) {
    const tex = parseTexture(files.read(source))
    const data = await sharp(Buffer.from(normalizeAdditiveRgba(tex.rgba)), {
      raw: { width: tex.width, height: tex.height, channels: 4 },
    })
      .webp({ lossless: true })
      .toBuffer()
    fs.writeFileSync(path.join(out, `${id}.webp`), data)
    assets.textures[id] = { source, url: `fx/${id}.webp`, sha256: hash(data) }
  }
  const json = {
    source: { path: 'Data/Effect/Effect.dat', sha256: hash(source) },
    adapter: 'upgrade-subset-v1',
    ...definitions,
    ...recoverAttachmentTags(files),
    assets,
  }
  fs.writeFileSync(
    path.join(ROOT, 'src/game/data/generated/lc-upgrade-effects.json'),
    `${JSON.stringify(json, null, 2)}\n`,
  )
  console.log(
    `Recovered ${Object.keys(json.groups).length} upgrade groups, ${Object.keys(json.effects).length} definitions, ${paths.length} models`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
