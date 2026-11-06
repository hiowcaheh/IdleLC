#!/usr/bin/env node
/**
 * How long each class skill's release animation runs and when its blow lands, for the game's combat
 * timing (src/game/data/generated/lc-skill-motion.json, read by the combat logic):
 *
 *   fire   the length of the release clip (lc-skill-anims.json's `fire`) in the converted class
 *          model; the client plays it to the end before the hero acts again (Player.es SkillAnimationEx:
 *          GetAnimLength(fire) × skill speed)
 *   impact the moment in that clip the blow shows (skills.lod fireobjDelay[0], weapon variant 0;
 *          Player.es: GetDelay(step) × skill speed), when the client has one
 *
 *   node scripts/lc/skill-motion.mjs --client <2015 client>
 *
 * The clip lengths come from public/models/lc (committed); skills.lod from the client.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { ClientFiles } from './client.mjs'
import { parseSkillTable } from './skill-anims.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const GENERATED = path.join(ROOT, 'src/game/data/generated')

/** Clip name (lower case) → length in seconds, for every clip of a GLB. */
async function clipLengths(io, file) {
  const doc = await io.read(file)
  return new Map(
    doc
      .getRoot()
      .listAnimations()
      .map((a) => [
        a.getName().toLowerCase(),
        Math.max(0, ...a.listSamplers().map((s) => s.getInput().getMax([0])[0])),
      ]),
  )
}

/** Seconds rounded to the millisecond. */
const ms = (seconds) => Math.round(seconds * 1000) / 1000

/**
 * Skill id → { fire, impact? } from the clips each class model holds and the skills.lod records.
 * `lengths` maps class id → clip lengths; skills without a release clip are left out.
 */
export function skillMotion(skills, anims, lengths, records) {
  const byId = new Map(records.map((r) => [r.id, r]))
  const motion = {}
  for (const skill of skills) {
    const clip = anims[skill.id]?.fire
    const fire = clip && lengths[skill.classId]?.get(clip.toLowerCase())
    if (!fire) continue
    const projectile = byId.get(skill.id)?.weapons[0]?.projectile
    const delay = projectile && projectile.delayCount > 0 ? projectile.delays[0] : 0
    motion[skill.id] = {
      fire: ms(fire),
      ...(delay > 0 && delay < fire ? { impact: ms(delay) } : {}),
    }
  }
  return motion
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args[0] !== '--client' || !args[1])
    throw new Error('Usage: skill-motion.mjs --client <client folder>')
  const files = new ClientFiles([path.resolve(args[1])])
  const data = JSON.parse(fs.readFileSync(path.join(GENERATED, 'lc-data.json'), 'utf8'))
  const anims = JSON.parse(fs.readFileSync(path.join(GENERATED, 'lc-skill-anims.json'), 'utf8'))
  const models = JSON.parse(fs.readFileSync(path.join(GENERATED, 'lc-models.json'), 'utf8'))
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const lengths = {}
  for (const model of models.models.filter((m) => m.id.startsWith('class-'))) {
    const file = path.join(ROOT, 'public', models.baseUrl, model.file.split('?')[0])
    lengths[model.id.replace(/^class-/, '')] = await clipLengths(io, file)
  }
  const records = parseSkillTable(files.read('Data\\skills.lod')).records
  const motion = skillMotion(data.skills, anims, lengths, records)
  fs.writeFileSync(path.join(GENERATED, 'lc-skill-motion.json'), JSON.stringify(motion))
  const timed = Object.values(motion).filter((m) => m.impact !== undefined).length
  console.log(
    `lc-skill-motion.json: ${Object.keys(motion).length} skills, ${timed} with a blow time`,
  )
}
