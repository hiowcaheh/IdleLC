import { describe, expect, it } from 'vitest'
import type { EffectDef } from './data.ts'
import { orbitPoints } from './orbit.ts'
import { IDENTITY } from './particles.ts'
import { TrailState } from './trail.ts'

const trail = (over: Partial<EffectDef> = {}): EffectDef => ({
  name: '(SB)test',
  kind: 'EFSB',
  lifeTime: 2,
  repeat: 0,
  fadeIn: 0,
  fadeOut: 0,
  width: 0.5,
  colorBegin: 0xff0000ff,
  colorEnd: 0x0000ff00,
  traceTime: 0.3,
  interval: 0.05,
  ...over,
})

describe('client trails and orbits', () => {
  it('keeps the last trace time of samples and colours the strip from end to begin', () => {
    const state = new TrailState(trail(), false)
    for (let i = 0; i <= 20; i++) state.process(i * 0.05, 2 - i * 0.05, [i * 0.1, 1, 0], null)
    const strip = state.strip([0, 1, 10])!
    expect(strip).not.toBeNull()
    const steps = strip.positions.length / 6
    expect(steps).toBeGreaterThan(3)
    // oldest end: the end colour (blue, transparent); newest: the begin colour (red, opaque)
    expect(strip.colors[2]).toBeGreaterThan(0.9)
    expect(strip.colors[3]).toBeLessThan(0.05)
    // the newest step stops one ratio step short of the begin colour, as in the client
    const lastColor = strip.colors.slice(-4)
    expect(lastColor[0]).toBeGreaterThan(0.7)
    expect(lastColor[3]).toBeGreaterThan(0.7)
    // a band of the effect's width, across the path and facing the viewer (+z here)
    const [x0, y0, z0, x1, y1, z1] = strip.positions.slice(0, 6) as number[]
    expect(Math.hypot(x1! - x0!, y1! - y0!, z1! - z0!)).toBeCloseTo(0.5, 2)
    expect(Math.abs(z1! - z0!)).toBeLessThan(1e-6)
  })

  it('spans two points of a group tag', () => {
    const state = new TrailState(trail({ kind: 'EFTC' }), true)
    for (let i = 0; i <= 6; i++) state.process(i * 0.05, 1, [i * 0.1, 0, 0], [i * 0.1, 1, 0])
    const strip = state.strip([0, 0, 10])!
    const [, ya, , , yb] = strip.positions.slice(-6) as number[]
    expect(ya).toBeCloseTo(0)
    expect(yb).toBeCloseTo(1)
  })

  it('puts orbit points on their sines around the tag', () => {
    const def: EffectDef = {
      name: '(OB)test',
      kind: 'EFOB',
      lifeTime: 1,
      repeat: 0,
      fadeIn: 0,
      fadeOut: 0,
      rotation: 1,
      position: 2,
      orbits: [
        {
          radius: [1, 0, 1],
          phaseMul: [Math.PI, 0, Math.PI],
          phaseOffset: [0, 0, 0.25],
          offset: [0, 2, 0],
          delay: 0,
          effect: '(SB)test',
        },
      ],
    }
    const frame = {
      position: [0, 0, 0] as [number, number, number],
      rotation: IDENTITY,
      first: true,
    }
    const tag = { position: [5, 0, 0] as [number, number, number], rotation: IDENTITY }
    const [start] = orbitPoints(def, 0, 1, tag, null, frame)
    expect(start).toEqual([5, 2, 1])
    const [half] = orbitPoints(def, 0.5, 0.5, tag, null, frame)
    expect(half![0]).toBeCloseTo(6)
    expect(half![2]).toBeCloseTo(0)
  })
})
