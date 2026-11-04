/** Recover individual skill FX references from skills.lod and AEFF/ANEF, without guessing by class. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { ClientFiles } from './client.mjs'
import { parseSkillTable } from './skill-anims.mjs'
import { parseAnimationEffects } from './anim-effects.mjs'
import { recoverUpgradeDefinitions } from './upgrade-effects.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const classes = {
  titan: ['Titan', 'ti'],
  knight: ['Knight', 'ni'],
  healer: ['Healer', 'hw'],
  mage: ['Mage', 'ma'],
  rogue: ['Rogue', 'ro'],
  sorcerer: ['Sorcerer', 'so'],
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function recoverSkillReferences(files, skills) {
  const lod = files.read('Data/skills.lod'),
    effect = files.read('Data/Effect/Effect.dat')
  const records = new Map(parseSkillTable(lod).records.map((skill) => [skill.id, skill]))
  const bae = Object.fromEntries(
    Object.entries(classes).map(([id, [dir, prefix]]) => {
      const source = `Data/Character/${dir}/${prefix}.bae`,
        bytes = files.read(source)
      return [id, { source, sha256: hash(bytes), animations: parseAnimationEffects(bytes) }]
    }),
  )
  const profiles = {},
    names = new Set()
  for (const skill of skills.filter((s) => s.type !== 3)) {
    const record = records.get(skill.id)
    if (!record) continue
    const variants = record.weapons.map((weapon) => {
      const events = Object.fromEntries(
        ['ready', 'still', 'fire'].map((phase) => [
          phase,
          bae[skill.classId].animations[weapon[phase]] ?? [],
        ]),
      )
      for (const name of [
        weapon.readyEffect,
        ...weapon.fireEffects,
        record.afterEffect,
        ...Object.values(events)
          .flat()
          .map((e) => e.group),
      ])
        if (name) names.add(name)
      return { ...weapon, events }
    })
    profiles[skill.id] = { classId: skill.classId, variants, afterEffect: record.afterEffect }
  }
  const groups = {},
    effects = {},
    unsupported = {}
  for (const name of names) {
    try {
      const recovered = recoverUpgradeDefinitions(effect, [name])
      if (!recovered.groups[name]) {
        unsupported[name] = 'missing group'
        continue
      }
      Object.assign(groups, recovered.groups)
      Object.assign(effects, recovered.effects)
    } catch (error) {
      unsupported[name] = error.message
    }
  }
  return {
    source: {
      skills: { path: 'Data/skills.lod', sha256: hash(lod) },
      effects: { path: 'Data/Effect/Effect.dat', sha256: hash(effect) },
      animations: Object.fromEntries(
        Object.entries(bae).map(([id, { source, sha256 }]) => [id, { path: source, sha256 }]),
      ),
    },
    profiles,
    groups,
    effects,
    unsupported,
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args[0] !== '--client' || !args[1])
    throw new Error('Usage: skill-effects.mjs --client <2015 client>')
  const files = new ClientFiles([path.resolve(args[1])])
  const data = JSON.parse(fs.readFileSync(path.join(root, 'src/game/data/generated/lc-data.json')))
  const result = recoverSkillReferences(files, data.skills)
  const out = args[2] ?? path.join(root, 'src/game/data/generated/lc-skill-effects.json')
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(
    `${Object.keys(result.profiles).length} skill profiles, ${Object.keys(result.groups).length} parsed groups, ${Object.keys(result.effects).length} definitions, ${Object.keys(result.unsupported).length} explicit unsupported groups`,
  )
}
