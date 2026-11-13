#!/usr/bin/env node
/**
 * The client's effects for the game's skills and titles, recovered whole from Effect.dat: every
 * group the class skills use (skills.lod ready / fire / after effects and the effects the class
 * animations key in their .bae), the monsters' skills and the titles' a_effect_name, with each
 * group's effects, the effects their paths and orbits carry, the particle systems and the texture,
 * model and legacy .mdl files they draw with.
 *
 *   node scripts/lc/client-effects.mjs --client <2015 client> [--report]
 *
 * Writes public/fx/client/effects.json (fetched by the game when it first draws an effect) and the
 * assets next to it. Effect kinds without a reader yet (sound, light, ...) stay in the file with
 * their kind and timing only, so the player can skip them without dropping their group.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Reader } from './binary.mjs'
import { ClientFiles } from './client.mjs'
import { parseAnimationEffects } from './anim-effects.mjs'
import { parseSkillTable } from './skill-anims.mjs'
import { readParticleGroup } from './title-particles.mjs'
import { readEffectGroups, readUpgradeEffect } from './upgrade-effects.mjs'
import { parseTexture, textureMexSize } from './texture.mjs'
import { mdlMesh, parseMdl } from './mdl.mjs'
import { buildModel } from './model.mjs'
import { parseSmc } from './smc.mjs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const GENERATED = path.join(ROOT, 'src/game/data/generated')
export const OUT = path.join(ROOT, 'public/fx/client')
const hash = (data) => createHash('sha256').update(data).digest('hex')

const CLASSES = {
  titan: ['Titan', 'ti'],
  knight: ['Knight', 'ni'],
  healer: ['Healer', 'hw'],
  mage: ['Mage', 'ma'],
  rogue: ['Rogue', 'ro'],
  sorcerer: ['Sorcerer', 'so'],
}

/**
 * Groups the client starts by name on a server message, not through a skill (SessionState.cpp
 * MSG_EFFECT_ETC_*): HP_STEAL / MP_STEAL when a steal potion takes life or mana from a hit.
 */
const EVENT_GROUPS = ['HP_STEAL', 'MP_STEAL']

/** The name line of a record (`<id><version>name\n`). */
function nameAt(buffer, at) {
  const end = buffer.indexOf(10, at + 5)
  if (end < 0 || end - at > 1024) throw new Error(`invalid name at ${at}`)
  return buffer
    .subarray(at + 5, end)
    .toString('latin1')
    .replace(/\r/g, '')
}

/** Record offsets of one kind between two markers: name → { at, end }. */
function recordIndex(buffer, id, from, until) {
  const offsets = []
  for (
    let at = buffer.indexOf(Buffer.from(id), from);
    at >= 0 && at < until;
    at = buffer.indexOf(Buffer.from(id), at + 4)
  )
    offsets.push(at)
  const index = new Map()
  offsets.forEach((at, i) => {
    const name = nameAt(buffer, at)
    // a later record of the same name replaces the earlier one, as CEffectManager registers them
    index.set(name, { at, end: i + 1 < offsets.length ? offsets[i + 1] : until })
  })
  return index
}

/**
 * The common CEffect header of any EFCT record (CEffect.cpp Read) and its kind, for kinds whose
 * body has no reader yet: they keep their name, timing and kind.
 */
function effectHeader(buffer, at) {
  const r = new Reader(buffer, at)
  if (r.id() !== 'EFCT') throw new Error(`expected EFCT at ${at}`)
  const v = r.u8()
  const end = buffer.indexOf(10, r.o)
  const name = buffer.subarray(r.o, end).toString('latin1').replace(/\r/g, '')
  r.o = end + 1
  const out = { name, lifeTime: r.f32(), repeat: r.i32(), fadeIn: r.f32(), fadeOut: r.f32() }
  if (v >= 2) out.boundingRadius = r.f32()
  out.kind = r.id()
  return out
}

/** Every effect of the given names, the ones their paths carry, and the particle systems. */
export function collectEffects(buffer, groupNames) {
  const allGroups = readEffectGroups(buffer)
  const fxFrom = buffer.indexOf(Buffer.from('EEFM'))
  const fxUntil = buffer.indexOf(Buffer.from('EEGM'))
  const effectIndex = recordIndex(buffer, 'EFCT', fxFrom, fxUntil)
  const particleIndex = recordIndex(buffer, 'PTGR', 0, fxFrom)
  const groups = {},
    effects = {},
    particles = {},
    missing = { groups: [], effects: [], particles: [] }
  const visitParticles = (name) => {
    if (particles[name] || !name) return
    const at = particleIndex.get(name)
    if (!at) {
      missing.particles.push(name)
      return
    }
    const { group, bytesRead } = readParticleGroup(buffer, at.at)
    if (at.at + bytesRead !== at.end)
      throw new Error(`incomplete particle system ${name}: ${at.at + bytesRead} != ${at.end}`)
    particles[name] = group
  }
  const visitEffect = (name) => {
    if (effects[name] || !name) return
    const at = effectIndex.get(name)
    if (!at) {
      missing.effects.push(name)
      return
    }
    let effect
    try {
      const read = readUpgradeEffect(buffer, at.at)
      if (at.at + read.bytesRead !== at.end - 4 && at.at + read.bytesRead !== at.end)
        throw new Error(`incomplete effect ${name}`)
      effect = read.effect
    } catch (error) {
      if (!/unsupported upgrade effect/.test(error.message)) throw error
      effect = { ...effectHeader(buffer, at.at), unsupported: true }
    }
    effects[name] = effect
    if (effect.kind === 'EFPT') visitParticles(effect.particleGroup)
    for (const p of effect.paths ?? []) visitEffect(p.effect)
    for (const o of effect.orbits ?? []) visitEffect(o.effect)
  }
  for (const name of groupNames) {
    const group = allGroups[name]
    if (!group) {
      missing.groups.push(name)
      continue
    }
    groups[name] = group
    for (const e of group.effects) visitEffect(e.name)
  }
  return { groups, effects, particles, missing }
}

/** Group names a class skill uses: its ready / fire / after effects and its clips' keyed effects. */
export function skillGroups(record, animationEffects) {
  const out = []
  const weapon = record.weapons[0]
  for (const name of [weapon.readyEffect, ...weapon.fireEffects, record.afterEffect])
    if (name) out.push(name)
  for (const clip of [weapon.ready, weapon.still, weapon.fire])
    for (const event of animationEffects?.[clip] ?? []) out.push(event.group)
  return out
}

async function main(argv) {
  const clients = []
  let report = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') clients.push(path.resolve(argv[++i]))
    else if (argv[i] === '--report') report = true
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!clients.length) throw new Error('Usage: client-effects.mjs --client <client> [--report]')
  const files = new ClientFiles(clients)
  const buffer = files.read('Data\\Effect\\Effect.dat')
  const data = JSON.parse(fs.readFileSync(path.join(GENERATED, 'lc-data.json'), 'utf8'))
  const records = new Map(
    parseSkillTable(files.read('Data\\skills.lod')).records.map((r) => [r.id, r]),
  )
  const animationEffects = Object.fromEntries(
    Object.entries(CLASSES).map(([id, [dir, prefix]]) => [
      id,
      parseAnimationEffects(files.read(`Data/Character/${dir}/${prefix}.bae`)),
    ]),
  )
  const skills = {}
  const names = new Set()
  for (const skill of [...data.skills, ...data.npcSkills]) {
    const record = records.get(skill.id)
    if (!record) continue
    const weapon = record.weapons[0]
    const keyed = (clip) =>
      (animationEffects[skill.classId]?.[clip] ?? []).map((e) => ({
        group: e.group,
        delay: e.delay,
      }))
    const entry = {
      ready: weapon.readyEffect || undefined,
      // FireEffect1 on the caster, FireEffect2 the missile, FireEffect3 the hit (Character.es)
      fire: weapon.fireEffects.slice(0, 1).filter(Boolean),
      missile: weapon.fireEffects[1] || undefined,
      hit: weapon.fireEffects[2] || undefined,
      after: record.afterEffect || undefined,
      projectile: weapon.projectile.type
        ? {
            type: weapon.projectile.type,
            speed: weapon.projectile.speed,
            delays: weapon.projectile.delays.slice(0, weapon.projectile.delayCount),
          }
        : undefined,
      clips: skill.classId
        ? { ready: keyed(weapon.ready), still: keyed(weapon.still), fire: keyed(weapon.fire) }
        : undefined,
    }
    skills[skill.id] = entry
    for (const name of skillGroups(record, animationEffects[skill.classId])) names.add(name)
  }
  for (const title of data.titles) if (title.effect) names.add(title.effect)
  for (const name of EVENT_GROUPS) names.add(name)
  const collected = collectEffects(buffer, [...names])
  const kinds = {}
  for (const e of Object.values(collected.effects))
    kinds[e.kind + (e.unsupported ? '?' : '')] =
      (kinds[e.kind + (e.unsupported ? '?' : '')] ?? 0) + 1
  const textures = new Set(),
    mdl = new Set(),
    smc = new Set()
  for (const e of Object.values(collected.effects)) {
    if (e.texture) textures.add(e.texture)
    if (e.kind === 'EFMD') mdl.add(e.model)
    if (e.kind === 'EFSK') smc.add(e.model)
  }
  for (const p of Object.values(collected.particles)) textures.add(p.texture)
  const summary = {
    groups: Object.keys(collected.groups).length,
    effects: Object.keys(collected.effects).length,
    particles: Object.keys(collected.particles).length,
    kinds,
    textures: textures.size,
    mdl: mdl.size,
    smc: smc.size,
    missing: Object.fromEntries(Object.entries(collected.missing).map(([k, v]) => [k, v.length])),
  }
  console.log(JSON.stringify(summary))
  if (report) return
  fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true })
  const textureAssets = await exportTextures(files, [...textures])
  const models = exportModels(files, [...mdl])
  const skaModels = await exportSkaModels(files, [...smc])
  fs.writeFileSync(
    path.join(OUT, 'effects.json'),
    JSON.stringify({
      source: { path: 'Data/Effect/Effect.dat', sha256: hash(buffer) },
      skills,
      groups: collected.groups,
      effects: collected.effects,
      particles: collected.particles,
      textures: textureAssets,
      models,
      skaModels,
    }),
  )
  console.log(
    `wrote ${Object.keys(textureAssets).length} textures, ${Object.keys(models).length} models, ` +
      `${Object.keys(skaModels).length} SKA models`,
  )
}

/**
 * The effect models (.mdl) of EFMD effects: path → the first mip as triangles per surface, every
 * frame's positions (metres, 4 decimals) and texture vertices in mex, the face-forward kind
 * (1 billboard, 2 turning about its own up axis) and the first animation (the effect loops anim 0).
 */
function exportModels(files, paths) {
  const out = {}
  const round = (n) => Math.round(n * 1e4) / 1e4
  for (const clientPath of paths.sort()) {
    if (!files.resolve(clientPath)) continue
    const model = parseMdl(files.read(clientPath))
    const mesh = mdlMesh(model)
    const anim = model.anims[0]
    out[clientPath] = {
      faceForward: model.faceForward,
      frames: mesh.frames.map((frame) => frame.map(round)),
      uv: mesh.uv,
      surfaces: mesh.surfaces,
      anim: anim ? { secsPerFrame: anim.secsPerFrame, frames: anim.frames } : null,
    }
  }
  return out
}

/**
 * The SKA models of EFSK effects as GLB (the same builder as the characters and the artifact
 * wings: unlit, WebP textures, the add / alpha blend of each surface's shader in its extras, the
 * animations of the .smc). Models whose meshes the client lacks are left out, as it draws nothing.
 */
async function exportSkaModels(files, paths) {
  const out = {}
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  fs.mkdirSync(path.join(OUT, 'ska'), { recursive: true })
  for (const clientPath of paths.sort()) {
    if (!files.resolve(clientPath)) continue
    const smc = parseSmc(files.read(clientPath).toString('latin1'))
    const { document, stats } = await buildModel(files, smc, { webp: true, unlit: true })
    if (!stats.meshes) {
      console.warn(`no meshes: ${clientPath} ${JSON.stringify(stats.missing)}`)
      continue
    }
    const glb = await io.writeBinary(document)
    const id = textureId(clientPath)
    fs.writeFileSync(path.join(OUT, 'ska', `${id}.glb`), glb)
    out[clientPath] = { url: `fx/client/ska/${id}.glb`, sha256: hash(glb).slice(0, 16) }
  }
  return out
}

/** A texture's file name in public/fx/client/tex: its base name and a short hash of its path. */
export function textureId(clientPath) {
  const base = path
    .basename(clientPath.replace(/\\/g, '/'), path.extname(clientPath))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
  return `${base}-${hash(clientPath.toLowerCase().replace(/\\/g, '/')).slice(0, 8)}`
}

/**
 * The textures as lossless WebP at their source size (UVs are in source texels): path → asset.
 * Textures missing from the client are left out; their effects draw nothing, as in the client.
 */
async function exportTextures(files, paths) {
  const out = {}
  for (const clientPath of paths.sort()) {
    if (!files.resolve(clientPath)) continue
    const texture = parseTexture(files.read(clientPath))
    const id = textureId(clientPath)
    const data = await sharp(Buffer.from(texture.rgba), {
      raw: { width: texture.width, height: texture.height, channels: 4 },
    })
      .webp({ lossless: true })
      .toBuffer()
    fs.writeFileSync(path.join(OUT, 'tex', `${id}.webp`), data)
    out[clientPath] = {
      url: `fx/client/tex/${id}.webp`,
      width: texture.width,
      height: texture.height,
      // a model's texture vertices are in mex: u = mex / mexWidth (RenderModel_View.cpp)
      ...textureMexSize(files.read(clientPath)),
      sha256: hash(data).slice(0, 16),
    }
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2))
}
