import { describe, expect, it } from 'vitest'
import type { ClientFxData, EffectDef } from './data.ts'
import { IDENTITY } from './particles.ts'
import { EffectGroupPlayer } from './player.ts'

const model: EffectDef = {
  name: '(MDL)long',
  kind: 'EFMD',
  lifeTime: 10,
  repeat: 0,
  fadeIn: 0,
  fadeOut: 0.5,
  model: 'plane.mdl',
  texture: 't.tex',
  color: 0xffffffff,
  stretch: [1, 1, 1],
  rotation: 2,
  position: 1,
  control: null,
}

const data: ClientFxData = {
  skills: {},
  groups: {
    missile: {
      effects: [{ time: 0, name: model.name }],
      tags: [{ time: 0, effect: 0, name: '__ROOT' }],
    },
  },
  effects: { [model.name]: model },
  particles: {},
  textures: { 't.tex': { url: 't.webp', width: 64, height: 64 } },
  models: {
    'plane.mdl': {
      faceForward: 0,
      frames: [[0, 0, 0, 1, 0, 0, 0, 0, 1]],
      uv: [0, 0, 64, 0, 0, 64],
      surfaces: [{ translucency: 3, doubleSided: true, color: 0xffffffff, index: [0, 1, 2] }],
      anim: { secsPerFrame: 0.1, frames: [0] },
    },
  },
}

const tags = () => ({ position: [1, 2, 3] as [number, number, number], rotation: IDENTITY })

describe('client effect groups (CEffectGroup)', () => {
  it('stops over the fade-out time, or within the time it is given', () => {
    const faded = new EffectGroupPlayer('missile', data, tags)
    faded.update(0.1)
    expect(faded.models()).toHaveLength(1)
    faded.stop()
    // half a second of fade-out left, instead of 9.9 s of life
    expect(faded.update(0.4)).toBe(true)
    expect(faded.models()[0]!.color & 255).toBeLessThan(255)
    expect(faded.update(0.2)).toBe(false)

    const cut = new EffectGroupPlayer('missile', data, tags)
    cut.update(0.1)
    cut.stop(0.04)
    expect(cut.update(0.05)).toBe(false)
  })
})
