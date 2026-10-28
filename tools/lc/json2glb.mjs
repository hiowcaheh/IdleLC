// Intermediate JSON (from lc2json.py) -> skinned, animated GLB.
// Usage (from the repo root): node tools/lc/json2glb.mjs <model.json> <model.glb>
import fs from 'node:fs'
import path from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'

const [input, output] = process.argv.slice(2)
const data = JSON.parse(fs.readFileSync(input, 'utf8'))
const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('Scene')

const acc = (type, array, name) =>
  doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer)

// SE models face +Z natively; the .smc OFFSET heading (180) only turns them for the SE camera,
// so it is ignored and models stay facing +Z like the rest of the game.
const root = doc.createNode('Root')
scene.addChild(root)

const bones = data.bones.map((b) => doc.createNode(b.name).setTranslation(b.t).setRotation(b.r))
data.bones.forEach((b, i) => (b.parent >= 0 ? bones[b.parent] : root).addChild(bones[i]))
let skin = null
if (bones.length > 0) {
  skin = doc.createSkin('Skin')
  bones.forEach((n) => skin.addJoint(n))
  skin.setInverseBindMatrices(
    acc('MAT4', new Float32Array(data.bones.flatMap((b) => b.ibm)), 'ibm'),
  )
}

const materials = new Map()
function material(prim) {
  const key = prim.png ?? `color:${prim.color}`
  if (materials.has(key)) return materials.get(key)
  const m = doc.createMaterial(path.basename(key)).setMetallicFactor(0).setRoughnessFactor(0.9)
  if (prim.png) {
    const tex = doc
      .createTexture(path.basename(prim.png))
      .setImage(fs.readFileSync(prim.png))
      .setMimeType(prim.png.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
    m.setBaseColorTexture(tex)
  } else if (prim.color != null) {
    const c = prim.color >>> 0
    m.setBaseColorFactor([
      ((c >>> 24) & 255) / 255,
      ((c >>> 16) & 255) / 255,
      ((c >>> 8) & 255) / 255,
      1,
    ])
  }
  materials.set(key, m)
  return m
}

for (const mesh of data.meshes) {
  const n = mesh.positions.length / 3
  const attrs = {
    POSITION: acc('VEC3', new Float32Array(mesh.positions), 'pos'),
    NORMAL: acc('VEC3', new Float32Array(mesh.normals), 'nrm'),
    TEXCOORD_0: acc('VEC2', new Float32Array(mesh.uvs), 'uv'),
  }
  if (skin) {
    attrs.JOINTS_0 = acc('VEC4', new Uint16Array(mesh.joints.flat()), 'joints')
    attrs.WEIGHTS_0 = acc('VEC4', new Float32Array(mesh.weights.flat()), 'weights')
  }
  const gm = doc.createMesh(mesh.name)
  for (const prim of data.primitives.filter((p) => p.mesh === mesh.name)) {
    const idx = n > 65535 ? new Uint32Array(prim.indices) : new Uint16Array(prim.indices)
    const p = doc
      .createPrimitive()
      .setIndices(acc('SCALAR', idx, 'idx'))
      .setMaterial(material(prim))
    for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v)
    gm.addPrimitive(p)
  }
  const node = doc.createNode(mesh.name).setMesh(gm)
  if (skin) node.setSkin(skin)
  root.addChild(node)
}

for (const anim of data.animations) {
  const a = doc.createAnimation(anim.name)
  for (const ch of anim.channels) {
    const sampler = doc
      .createAnimationSampler()
      .setInput(acc('SCALAR', new Float32Array(ch.times), 't'))
      .setOutput(
        acc(ch.path === 'rotation' ? 'VEC4' : 'VEC3', new Float32Array(ch.values.flat()), 'v'),
      )
      .setInterpolation('LINEAR')
    a.addSampler(sampler).addChannel(
      doc
        .createAnimationChannel()
        .setTargetNode(bones[ch.bone])
        .setTargetPath(ch.path)
        .setSampler(sampler),
    )
  }
}

await new NodeIO().write(output, doc)
console.log(`wrote ${output}: ${(fs.statSync(output).size / 1024).toFixed(0)} KB`)
