import { describe, expect, it } from 'vitest'
import type { ParticleGroupDef } from './data.ts'
import {
  IDENTITY,
  ParticleSystem,
  RandomTable,
  dynamicState,
  lerpColor,
  particleAngle,
  quatFromEuler,
  rotate,
  sampleNumber,
} from './particles.ts'

// a fixed table, so the tests never depend on Math.random
const table = () => {
  let seed = 7
  return new RandomTable(() => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  })
}

const base = (over: Partial<ParticleGroupDef> = {}): ParticleGroupDef => ({
  name: 'test',
  texture: 't.tex',
  render: 0,
  blend: 206,
  mexWidth: 32,
  mexHeight: 32,
  col: 0,
  row: 0,
  processes: [],
  emitter: {
    type: 1,
    kind: 'sphere',
    totalCount: 10,
    countPerSecond: 20,
    local: false,
    particle: {
      life: [1, 1],
      width: [0.5, 0.5],
      height: [0.5, 0.5],
      row: 0,
      col: 0,
      mass: [1, 1],
      color: [0xffffffff, 0xffffffff],
      quaternion: { w: [1, 1], x: [0, 0], y: [0, 0], z: [0, 0] },
    },
    force: { type: 0, power: 0, position: [0, 0, 0], direction: [0, 0, 0] },
    delay: 0,
    shape: { radiusInner: 1, radiusOuter: 1, center: [0, 0, 0] },
  },
  absorption: { type: 1, move: 1, dependLife: true, kind: 'default' },
  ...over,
})

describe('client particle systems', () => {
  it('emits at its rate up to its total, then ends when every particle has lived its life', () => {
    const system = new ParticleSystem(base(), table())
    system.setPlacement([5, 0, 0], IDENTITY)
    system.process(0.25)
    expect(system.particles).toHaveLength(5) // 20 a second
    for (const p of system.particles)
      expect(Math.hypot(p.position[0] - 5, p.position[1], p.position[2])).toBeCloseTo(1, 5)
    system.process(0.25)
    expect(system.particles).toHaveLength(10)
    system.process(0.25)
    expect(system.particles).toHaveLength(10) // total reached
    let alive = true
    for (let i = 0; i < 20 && alive; i++) alive = system.process(0.1)
    expect(system.particles).toHaveLength(0)
    expect(alive).toBe(false)
  })

  it('a stopped emitter adds nothing more; a repeat restarts its count', () => {
    const system = new ParticleSystem(base(), table())
    system.process(0.1)
    expect(system.particles).toHaveLength(2)
    system.stop()
    system.process(0.1)
    expect(system.particles).toHaveLength(2)
    system.restart()
    system.process(0.1)
    expect(system.particles.length).toBeGreaterThan(2)
  })

  it('moves particles by speed from a cone and turns the emitter with its tag', () => {
    const def = base({
      emitter: {
        ...base().emitter!,
        kind: 'cone',
        type: 2,
        speed: [2, 2],
        useShapePosition: false,
        useShapeSpeed: true,
        shape: {
          heightUpper: 1,
          heightLower: 1,
          hotspot: 0,
          falloff: 0,
          center: [0, 0, 0],
          closeRange: 0,
          lerpRatio: 0,
        },
      } as ParticleGroupDef['emitter'],
    })
    const system = new ParticleSystem(def, table())
    // the tag points the cone's up along +x
    system.setPlacement([0, 0, 0], quatFromEuler([0, 0, -90]))
    system.process(0.1)
    for (const p of system.particles) {
      expect(p.velocity[0]).toBeCloseTo(2, 4)
      expect(p.velocity[1]).toBeCloseTo(0, 4)
    }
  })

  it('fades alpha in and out over a particle life and repeats an alpha track', () => {
    const dynamic = {
      kind: 'dynamic' as const,
      fadeIn: 0.5,
      fadeOut: 0.25,
      color: [],
      alpha: [
        { time: 0, value: 0 },
        { time: 1, value: 200 },
      ],
      texPos: [],
      size: [],
      mass: [],
      deltaPos: [],
      angle: [],
    }
    const p = {
      life: 2,
      age: 0.25,
      width: 1,
      height: 1,
      row: 0,
      col: 0,
      mass: 1,
      color: 0xffffffff,
      position: [0, 0, 0] as [number, number, number],
      direction: IDENTITY,
      velocity: [0, 0, 0] as [number, number, number],
      acceleration: [0, 0, 0] as [number, number, number],
      final: [0, 0, 0] as [number, number, number],
    }
    dynamicState(dynamic, p, 0.05)
    // 50 from the track at 0.25 s, half faded in
    expect(p.color & 255).toBe(25)
    p.age = 1.5
    dynamicState(dynamic, p, 0.05)
    expect(p.color & 255).toBe(100) // the track repeats each second
    p.age = 1.9
    dynamicState(dynamic, p, 0.05)
    expect(p.color & 255).toBe(Math.trunc(sampleNumber(dynamic.alpha, 0.9) * (0.1 / 0.25)))
  })

  it('lerps packed RGBA colours per channel and reads a quad turn from its quaternion', () => {
    expect(lerpColor(0x000000ff, 0xff0000ff, 0.5)).toBe(0x800000ff)
    const turned = { direction: quatFromEuler([90, 0, 0]) }
    expect(particleAngle(turned as never)).toBeCloseTo(Math.PI / 2, 5)
    const v = rotate([0, 1, 0], quatFromEuler([0, 90, 0]))
    expect(v[2]).toBeCloseTo(1, 5)
  })
})
