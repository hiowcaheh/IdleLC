import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import data from '../../src/game/data/generated/lc-artifact-effects.json'

describe('original Seraphim wing assets', () => {
  it('ships both hashed, fully animated original meshes with alpha textures and finite skinning', async () => {
    expect(data.adapter).toBe('seraphim-ska-wings-v1')
    expect(data.groups.Angel_wing03.effects).toHaveLength(11)
    expect(data.wings).toHaveLength(6)
    expect(Object.keys(data.models)).toHaveLength(2)
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    for (const asset of Object.values(data.models)) {
      const bytes = fs.readFileSync(new URL(`../../public/${asset.url}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256)
      const root = (await io.readBinary(bytes)).getRoot()
      expect(root.listAnimations()).toHaveLength(1)
      expect(root.listAnimations()[0].listChannels().length).toBeGreaterThan(0)
      expect(root.listSkins().length).toBeGreaterThan(0)
      for (const a of root.listAccessors())
        expect(Array.from(a.getArray()).every(Number.isFinite)).toBe(true)
      for (const material of root.listMaterials()) {
        expect(material.getAlphaMode()).toBe('MASK')
        expect(material.getExtras().lcShader).toBe('Shaders\\Default.sha')
        expect(material.getDoubleSided()).toBe(true)
        expect(material.getBaseColorTexture()).not.toBeNull()
      }
    }
  })
})
