import { describe, expect, it } from 'vitest'
import type { EffectDef } from './data.ts'
import { effectFade, modelLook, modelPlacement, sampleSpline } from './modelEffect.ts'
import { IDENTITY, quatFromEuler, rotate } from './particles.ts'

const effect = (over: Partial<EffectDef> = {}): EffectDef => ({
  name: '(MDL)test',
  kind: 'EFMD',
  lifeTime: 2,
  repeat: 0,
  fadeIn: 0.5,
  fadeOut: 0.5,
  model: 'Data\\Effect\\Mdl\\PlaneAdd.mdl',
  texture: 't.tex',
  color: 0xff8040c8,
  stretch: [2, 2, 2],
  rotation: 2,
  position: 1,
  control: null,
  ...over,
})

describe('client model effects (CMdlEffect)', () => {
  it('fades the model colour in and out over its life without a control', () => {
    expect(effectFade(effect(), 0.25, 1.75)).toBeCloseTo(0.5)
    expect(effectFade(effect(), 1, 1)).toBe(1)
    expect(effectFade(effect(), 1.8, 0.2)).toBeCloseTo(0.4)
    const look = modelLook(effect(), 0.25, 1.75)
    expect(look.color >>> 8).toBe(0xff8040)
    expect(look.color & 255).toBe(Math.trunc(0xc8 * 0.5))
    expect(look.stretch).toEqual([2, 2, 2])
    expect(look.offset).toBeNull()
  })

  it('with a control: repeats the alpha track, fades by the effect times and keeps alpha otherwise', () => {
    const control = {
      twinkle: 0,
      fadeIn: 0,
      fadeOut: 0,
      color: [],
      alpha: [
        { time: 0, value: 255 },
        { time: 1, value: 55 },
      ],
      stretch: [],
      position: [],
      angle: [],
    }
    const def = effect({ control, lifeTime: 4, fadeIn: 0, fadeOut: 0 })
    // the track repeats every second: 1.5 s reads it at 0.5 s
    expect(modelLook(def, 1.5, 2.5).color & 255).toBe(155)
    // without alpha tracks or fades the model's own alpha stays
    const plain = effect({ control: { ...control, alpha: [] }, fadeIn: 0, fadeOut: 0 })
    expect(modelLook(plain, 1, 1).color & 255).toBe(0xc8)
    // a fade (the effect's time) works on an opaque 255, not on the model's alpha
    const faded = effect({ control: { ...control, alpha: [] }, fadeIn: 1, fadeOut: 0 })
    expect(modelLook(faded, 0.5, 1.5).color & 255).toBe(127)
  })

  it('moves along a natural cubic spline through its keys and turns the offset with the effect', () => {
    const track = [
      { time: 0, value: [0, 0, 0] },
      { time: 1, value: [1, 2, 0] },
      { time: 2, value: [0, 4, 0] },
    ]
    expect(sampleSpline(track, 0)).toEqual([0, 0, 0])
    const mid = sampleSpline(track, 1)
    expect(mid[0]).toBeCloseTo(1)
    expect(mid[1]).toBeCloseTo(2)
    // two keys have flat ends: halfway is halfway
    expect(sampleSpline(track.slice(0, 2), 0.5)[1]).toBeCloseTo(1)
    const turned = quatFromEuler([90, 0, 0])
    const placed = modelPlacement(
      { rotation: 2, position: 1 },
      { offset: [1, 0, 0], angle: null },
      { position: [5, 0, 0], rotation: IDENTITY },
      { position: [9, 0, 0], rotation: turned },
    )
    // stays where it started (EOTT_START position), the offset turned with the tag (EOTT_ALWAYS)
    const expected = rotate([1, 0, 0], turned)
    expect(placed.position[0]).toBeCloseTo(5 + expected[0])
    expect(placed.position[2]).toBeCloseTo(expected[2])
    const follows = modelPlacement(
      { rotation: 0, position: 2 },
      { offset: null, angle: null },
      { position: [5, 0, 0], rotation: turned },
      { position: [9, 1, 0], rotation: turned },
    )
    expect(follows.position).toEqual([9, 1, 0])
    expect(follows.rotation).toEqual(IDENTITY)
  })
})
