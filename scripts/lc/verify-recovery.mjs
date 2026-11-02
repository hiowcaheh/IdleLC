/** Validate the reviewed recovery batch against shipped GLBs and data. No raw client required.
 * Run: node scripts/lc/verify-recovery.mjs [--report] (also refresh the audit JSON).
 */
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p)))
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const batch = read('scripts/lc/batches/recovery-2015.json')
const gear = read('src/game/data/generated/lc-gear.json')
const modelManifest = read('src/game/data/generated/lc-models.json')
const itemSources = read('src/game/data/generated/lc-item-models.json')
const mappings = read('src/game/data/generated/lc-skill-anims.json')
const data = read('src/game/data/generated/lc-data.json')
const sourceItems = new Map(
  Object.entries(itemSources).map(([smc, ids]) => [
    path.win32.basename(smc, '.smc').toLowerCase(),
    ids,
  ]),
)
for (const [id, ids] of sourceItems)
  assert.deepEqual(gear.models[id].items, ids, id + ' is exact item mapping')
const classBones = new Map()
const allClips = new Map()
const counts = {
  models: 0,
  gear: 0,
  textures: 0,
  flatFallbacks: 0,
  meshes: 0,
  animationSamplers: 0,
}
for (const model of batch.models) {
  const doc = await io.read(path.join(root, 'public/models/lc', model.id + '.glb'))
  const dr = doc.getRoot()
  assert(dr.listMeshes().length > 0, model.id + ' meshes')
  counts.meshes += dr.listMeshes().length
  if (model.id.startsWith('class-')) {
    classBones.set(
      model.id,
      new Set(
        dr
          .listSkins()
          .flatMap((s) => s.listJoints())
          .map((j) => j.getName()),
      ),
    )
    allClips.set(model.id, new Set(dr.listAnimations().map((a) => a.getName().toLowerCase())))
  }
  if (model.id.startsWith('gear/')) {
    counts.gear++
    const prefix = model.id.slice(5, 7)
    const cid = {
      ni: 'knight',
      ti: 'titan',
      hw: 'healer',
      ma: 'mage',
      ro: 'rogue',
      so: 'sorcerer',
    }[prefix]
    for (const joint of dr.listSkins().flatMap((s) => s.listJoints()))
      assert(
        classBones.get('class-' + cid).has(joint.getName()),
        model.id + ' foreignbone ' + joint.getName(),
      )
  }
  for (const mat of dr.listMaterials()) {
    if (mat.getBaseColorTexture()) counts.textures++
    if (!mat.getBaseColorTexture() && [0.25, 0.6].includes(mat.getMetallicFactor()))
      counts.flatFallbacks++
  }
  for (const acc of dr.listAccessors()) {
    const values = acc.getArray()
    assert(
      values && values.every(Number.isFinite),
      model.id + ' nonfinite accessor ' + acc.getName(),
    )
  }
  for (const anim of dr.listAnimations())
    for (const s of anim.listSamplers()) {
      assert(
        s.getInput().getCount() > 0 && s.getOutput().getCount() > 0,
        model.id + ' empty sampler',
      )
      counts.animationSamplers++
    }
  counts.models++
}
assert.equal(counts.gear, batch.models.filter((m) => m.id.startsWith('gear/')).length)
assert.equal(counts.flatFallbacks, 0)
const missingClips = []
for (const [id, phases] of Object.entries(mappings)) {
  const skill = data.skills.find((s) => s.id === +id)
  for (const name of Object.values(phases))
    if (!allClips.get('class-' + skill.classId).has(name.toLowerCase()))
      missingClips.push({ id: +id, clip: name })
}
for (const missing of missingClips) {
  const skill = data.skills.find((s) => s.id === missing.id)
  const model = batch.models.find((m) => m.id === 'class-' + skill.classId)
  assert(
    model.allowedMissing?.includes('animation ' + missing.clip),
    'unexpected missing animation ' + missing.clip,
  )
}
for (const m of modelManifest.models) {
  const hash = createHash('sha1')
    .update(fs.readFileSync(path.join(root, 'public', modelManifest.baseUrl, m.file.split('?')[0])))
    .digest('hex')
    .slice(0, 10)
  assert(m.file.endsWith('?v=' + hash), m.id + ' stale URL')
}
for (const [id, m] of Object.entries(gear.models)) {
  const hash = createHash('sha1')
    .update(fs.readFileSync(path.join(root, 'public', gear.baseUrl, m.file.split('?')[0])))
    .digest('hex')
    .slice(0, 10)
  assert(m.file.endsWith('?v=' + hash), id + ' stale URL')
}
const icons = read('src/game/data/generated/lc-icons.json')
assert.equal(Object.keys(icons.items.icons).length, data.items.length)
assert.equal(Object.keys(icons.skills.icons).length, data.skills.length)
const result = {
  date: new Date().toISOString().slice(0, 10),
  baseline: batch.baselineCommit,
  sourceArchive: batch.sourceArchive,
  converted: counts,
  gearManifestModels: Object.keys(gear.models).length,
  exactGearMappings: sourceItems.size,
  modelManifestModels: modelManifest.models.length,
  itemIcons: Object.keys(icons.items.icons).length,
  skillIcons: Object.keys(icons.skills.icons).length,
  skillMappings: Object.keys(mappings).length,
  knownMissingClips: missingClips,
  checks: [
    'all recovery GLBs decoded with Meshopt',
    'all decoded accessor values finite',
    'all gear joints belong to class skeleton',
    'no flat texture fallbacks',
    'all gear item mappings match original SMC groups',
    'all model and gear URL hashes match bytes',
    'all imported items and skills mapped to icons',
  ],
}
if (process.argv.includes('--report'))
  fs.writeFileSync(
    path.join(root, 'docs/source-audit/recovery-validation.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
console.log(JSON.stringify(result, null, 2))
