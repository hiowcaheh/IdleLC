import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { validateTitleParticle } from './title-effects.mjs'
import { readParticleGroup } from './title-particles.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const data = JSON.parse(
  fs.readFileSync(path.join(root, 'src/game/data/generated/lc-title-effects.json')),
)

describe('recovered title particle assets', () => {
  it('retains complete dependencies, source-supported processes and exact shipped hashes', () => {
    expect(Object.keys(data.effects)).toHaveLength(36)
    expect(Object.keys(data.textures)).toHaveLength(5)
    for (const group of Object.values(data.groups)) {
      expect(group.effects).toHaveLength(3)
      expect(group.tags.every((tag) => tag.name === 'CENTER')).toBe(true)
      for (const effect of group.effects)
        expect(data.particles[data.effects[effect.name].particleGroup]).toBeDefined()
    }
    for (const group of Object.values(data.particles)) {
      expect(() => validateTitleParticle(group)).not.toThrow()
      expect(data.textures[group.textureAsset]).toBeDefined()
    }
    for (const texture of Object.values(data.textures)) {
      const bytes = fs.readFileSync(path.join(root, 'public', texture.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(texture.sha256)
      expect(texture.width).toBe(64)
      expect(texture.height).toBe(64)
    }
  })

  it('rejects unsupported render/blend/emitter/process combinations instead of inventing a look', () => {
    const green = data.particles.eff_nameGREEN
    expect(() => validateTitleParticle({ ...green, blend: 208 })).toThrow(/blend/)
    expect(() =>
      validateTitleParticle({ ...green, emitter: { ...green.emitter, local: false } }),
    ).toThrow(/emitter/)
    expect(() => validateTitleParticle({ ...green, processes: [{ kind: 'force' }] })).toThrow(
      /process/,
    )
    expect(() => readParticleGroup(Buffer.from('PTGR\x01incomplete\n'))).toThrow()
  })
})
