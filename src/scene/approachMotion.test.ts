import { describe, expect, it } from 'vitest'
import { approachTime, createCombat, type ActiveEffect } from '../game/logic/combat.ts'
import { VisibleClock } from '../game/session/visibleClock.ts'
import { approachProgress } from './approachMotion.ts'

function combat(moveSpeed = 0) {
  const fighter = {
    level: 1,
    stats: {
      maxHp: 100,
      attack: 10,
      defense: 5,
      attackInterval: 1,
      critChance: 0,
      critMultiplier: 1.5,
      moveSpeed,
    },
  }
  const state = createCombat(fighter, 'fixture', fighter)
  state.phase = 'approach'
  return state
}

describe('approach animation between simulation steps', () => {
  it.each([30, 60, 90, 120])('moves on every render frame at %s FPS', (fps) => {
    const state = combat()
    const clock = new VisibleClock()
    clock.reset(0)
    let previous = 0
    let steps = 0
    for (let frame = 1; frame <= fps / 2; frame++) {
      const dt = clock.read((frame * 1000) / fps)
      state.phaseTime += dt
      if (dt > 0) steps++
      const progress = approachProgress(state, clock.interpolationSeconds, 1)
      const t = frame / fps / approachTime(state)
      expect(progress).toBeCloseTo(t * t * (3 - 2 * t), 9)
      expect(progress).toBeGreaterThan(previous)
      previous = progress
    }
    expect(steps).toBe(10)
    expect(state.phaseTime).toBeCloseTo(0.5)
  })

  it.each([0.5, 1, 2])('keeps the dev time scale %s consistent with rendered movement', (scale) => {
    const state = combat()
    const clock = new VisibleClock()
    clock.reset(0)
    for (let frame = 1; frame <= 20; frame++) {
      state.phaseTime += clock.read((frame * 1000) / 60) * scale
      const t = ((frame / 60) * scale) / approachTime(state)
      expect(approachProgress(state, clock.interpolationSeconds, scale)).toBeCloseTo(
        t * t * (3 - 2 * t),
        9,
      )
    }
  })

  it('preserves the effect of run speed and clamps the arrival to the destination', () => {
    const normal = combat()
    const faster = combat(100)
    normal.phaseTime = faster.phaseTime = 0.3
    expect(approachTime(faster)).toBeCloseTo(approachTime(normal) / 2)
    expect(approachProgress(faster, 0.025, 1)).toBeGreaterThan(approachProgress(normal, 0.025, 1))
    normal.phaseTime = approachTime(normal) - 0.01
    expect(approachProgress(normal, 0.04, 1)).toBe(1)
    expect(normal.phaseTime).toBeCloseTo(1.29)
  })

  it.each(['stun', 'stone', 'hold'] as const)(
    'does not drift between ticks while %s blocks movement',
    (kind) => {
      const state = combat()
      state.phaseTime = 0.3
      const effect: ActiveEffect = {
        skillId: 0,
        name: kind,
        remaining: 5,
        stats: [],
        stun: kind === 'stun',
        state: kind === 'stun' ? undefined : kind,
        poison: 0,
        nextTick: 1,
      }
      state.player.effects = [effect]
      expect(approachProgress(state, 0.01, 1)).toBe(approachProgress(state, 0, 1))
      expect(approachProgress(state, 0.04, 1)).toBe(approachProgress(state, 0, 1))
    },
  )
})
