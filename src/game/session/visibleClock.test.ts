import { describe, expect, it } from 'vitest'
import { VisibleClock } from './visibleClock.ts'
import { combatTick, createCombat } from '../logic/combat.ts'
import { createRng } from '../logic/rng.ts'

describe('visible play clock', () => {
  it('produces the same combat outcomes and RNG events at 2, 5, 10, 20 and 60 FPS', () => {
    const stats = {
      maxHp: 200,
      attack: 20,
      defense: 5,
      attackInterval: 1.2,
      critChance: 0.1,
      critMultiplier: 2,
    }
    const run = (fps: number) => {
      const clock = new VisibleClock(),
        rng = createRng(7),
        events = []
      clock.reset(0)
      let state = createCombat({ level: 1, stats }, 'fixture', {
        level: 1,
        stats: { ...stats, maxHp: 100, attack: 10 },
      })
      for (let frame = 1; frame <= 60 * fps; frame++) {
        const result = combatTick(state, clock.read((frame * 1000) / fps), rng)
        state = result.state
        events.push(...result.events)
      }
      return { kills: state.kills, deaths: state.deaths, events }
    }
    const reference = run(60)
    for (const fps of [2, 5, 10, 20]) expect(run(fps)).toEqual(reference)
  })
  it.each([60, 20, 10, 5, 2])('retains 60 seconds at %s FPS', (fps) => {
    const clock = new VisibleClock()
    clock.reset(0)
    let elapsed = 0
    for (let frame = 1; frame <= fps * 60; frame++) elapsed += clock.read((frame * 1000) / fps)
    expect(elapsed).toBeCloseTo(60, 8)
  })
  it('budgets a long frame without dropping its remaining time', () => {
    const clock = new VisibleClock()
    clock.reset(0)
    expect(clock.read(12_000)).toBe(5)
    expect(clock.read(12_000)).toBe(5)
    expect(clock.read(12_000)).toBe(2)
    expect(clock.read(12_000)).toBe(0)
  })
  it('excludes time in a hidden tab without discarding visible time before it', () => {
    const clock = new VisibleClock()
    clock.reset(0)
    clock.visibility(false, 500)
    expect(clock.read(30_000)).toBe(0)
    clock.visibility(true, 60_000)
    expect(clock.read(60_500)).toBe(1)
  })
  it('exposes the render fraction without advancing or consuming simulation time', () => {
    const clock = new VisibleClock()
    clock.reset(0)
    expect(clock.read(16)).toBe(0)
    expect(clock.interpolationSeconds).toBeCloseTo(0.016)
    expect(clock.interpolationSeconds).toBeCloseTo(0.016)
    expect(clock.read(33)).toBe(0)
    expect(clock.interpolationSeconds).toBeCloseTo(0.033)
    expect(clock.read(50)).toBe(0.05)
    expect(clock.interpolationSeconds).toBeCloseTo(0)
    expect(clock.read(67)).toBe(0)
    expect(clock.interpolationSeconds).toBeCloseTo(0.017)
    clock.reset(70)
    expect(clock.interpolationSeconds).toBe(0)
  })
  it('does not extrapolate a backlog or a hidden tab', () => {
    const clock = new VisibleClock()
    clock.reset(0)
    expect(clock.read(12_025)).toBe(5)
    expect(clock.interpolationSeconds).toBe(0)
    expect(clock.read(12_025)).toBe(5)
    expect(clock.interpolationSeconds).toBe(0)
    expect(clock.read(12_025)).toBe(2)
    expect(clock.interpolationSeconds).toBeCloseTo(0.025)
    clock.visibility(false, 12_030)
    expect(clock.interpolationSeconds).toBe(0)
    clock.visibility(true, 60_000)
    expect(clock.read(60_000)).toBe(0)
    expect(clock.interpolationSeconds).toBeCloseTo(0.03)
  })
})
