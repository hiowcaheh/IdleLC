import { describe, expect, it } from 'vitest'
import { nextDungeonWaveIn } from './waveStatus.ts'

const cleared = {
  wave: 1,
  elapsed: 10,
  remainingSpawns: 0,
  nextWaveIn: null,
  enemies: [],
  ended: null,
}

describe('wave clear countdown', () => {
  it('waits for every queued and living monster, but allows the last death animation', () => {
    expect(nextDungeonWaveIn({ ...cleared, wave: 0 })).toBeNull()
    expect(nextDungeonWaveIn({ ...cleared, remainingSpawns: 1 })).toBeNull()
    expect(nextDungeonWaveIn({ ...cleared, enemies: [{ fighter: { hp: 1 } }] })).toBeNull()
    expect(nextDungeonWaveIn({ ...cleared, enemies: [{ fighter: { hp: 0 } }] })).toBe(5)
  })

  it('counts down from at most five using simulation time, so a paused clock keeps its value', () => {
    expect(nextDungeonWaveIn(cleared)).toBe(5)
    const paused = { ...cleared, nextWaveIn: 3.2 }
    expect(nextDungeonWaveIn(paused)).toBe(4)
    expect(nextDungeonWaveIn(paused)).toBe(4)
    expect(nextDungeonWaveIn({ ...cleared, nextWaveIn: 0.05 })).toBe(1)
    expect(nextDungeonWaveIn({ ...cleared, nextWaveIn: 8 })).toBe(5)
  })

  it('shows the earlier scheduled arrival and keeps the five-second wait for repeated wave 20', () => {
    expect(nextDungeonWaveIn({ ...cleared, elapsed: 28.4, nextWaveIn: 4.6 })).toBe(2)
    expect(nextDungeonWaveIn({ ...cleared, wave: 2, elapsed: 11, nextWaveIn: 4.6 })).toBe(5)
    expect(nextDungeonWaveIn({ ...cleared, wave: 20, elapsed: 200, nextWaveIn: 4.6 })).toBe(5)
  })

  it('does not promise another wave when the round ends before it arrives', () => {
    expect(nextDungeonWaveIn({ ...cleared, ended: 'completed' })).toBeNull()
    expect(nextDungeonWaveIn({ ...cleared, wave: 20, elapsed: 598, nextWaveIn: 3 })).toBeNull()
    expect(nextDungeonWaveIn({ ...cleared, wave: 20, elapsed: 598, nextWaveIn: 1 })).toBe(1)
  })
})
