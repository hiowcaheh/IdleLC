import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AnimationMixer, Object3D, PropertyBinding, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'meshoptimizer'
import { placeSourceTag } from '../../src/scene/upgradeEffects.ts'

/** Keep shipped geometry/skin/animation bytes; remove image references for the Node-only loader. */
async function loadRig(classId) {
  const bytes = fs.readFileSync(path.resolve('public/models/lc', `class-${classId}.glb`))
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) delete primitive.material
  delete json.materials
  delete json.textures
  delete json.images
  const text = Buffer.from(JSON.stringify(json))
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32)
  text.copy(padded)
  const bin = bytes.subarray(20 + jsonLength)
  const header = Buffer.alloc(20)
  header.write('glTF')
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + padded.length + bin.length, 8)
  header.writeUInt32LE(padded.length, 12)
  header.write('JSON', 16)
  const glb = Buffer.concat([header, padded, bin])
  const data = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '')
  const bones = new Map()
  data.scene.traverse((child) => {
    if (child.isBone) bones.set(child.name, child)
  })
  const idle = data.animations.find((clip) => /idle/i.test(clip.name)) ?? data.animations[0]
  if (idle) {
    const mixer = new AnimationMixer(data.scene)
    mixer.clipAction(idle).play()
    mixer.update(0.7)
  }
  data.scene.updateMatrixWorld(true)
  return {
    object: data.scene,
    bones,
    weapons: new Set(),
    weaponModels: new Map(),
    classId,
  }
}

describe('source tags on shipped GLTF rigs', () => {
  it('resolves real GLTF-loader joint names and keeps tags on posed hands and torso for all six classes', async () => {
    for (const classId of ['titan', 'knight', 'healer', 'mage', 'rogue', 'sorcerer']) {
      const target = await loadRig(classId)
      const holder = new Object3D()
      holder.position.set(3, 0, 4)
      holder.rotation.y = 0.3
      holder.add(target.object)
      holder.updateMatrixWorld(true)
      const anchor = new Object3D()
      holder.add(anchor)
      for (const [tag, joint] of [
        ['LHAND', 'Bip01 L Hand'],
        ['RHAND', 'Bip01 R Hand'],
      ]) {
        expect(target.bones.has(joint)).toBe(false)
        const bone = target.bones.get(PropertyBinding.sanitizeNodeName(joint))
        expect(bone).toBeDefined()
        expect(placeSourceTag(target, tag, holder, anchor)).toBe(true)
        holder.updateMatrixWorld(true)
        const hand = bone.getWorldPosition(new Vector3())
        const attached = anchor.getWorldPosition(new Vector3())
        expect(attached.distanceTo(hand)).toBeLessThan(0.16)
        expect(anchor.position.y).toBeGreaterThan(0.5)
      }
      expect(placeSourceTag(target, 'CENTER', holder, anchor)).toBe(true)
      expect(anchor.position.y).toBeGreaterThan(0.8)
      const fairy = anchor.position
        .clone()
        .add(new Vector3(0.3, 0.7, 0).applyQuaternion(anchor.quaternion))
      const head = new Object3D()
      expect(placeSourceTag(target, 'HEAD', holder, head)).toBe(true)
      expect(Math.abs(fairy.y - head.position.y)).toBeLessThan(0.5)
      expect(placeSourceTag(target, 'MISSING_HAND', holder, anchor)).toBe(false)
    }
  })
})
