import { describe, expect, it } from 'vitest'
import source from '../game/data/generated/lc-title-effects.json'
import {
  titleParticle,
  titleParticleCount,
  titleSample,
  type TitleParticleGroup,
} from './titleEffects.ts'

const particles = source.particles as unknown as Record<string, TitleParticleGroup>

describe('source title smoke', () => {
  it('uses the actual class title groups at CENTER, including three green smoke layers', () => {
    expect(Object.keys(source.groups)).toHaveLength(12)
    expect(Object.keys(source.particles)).toHaveLength(36)
    expect(
      source.groups.eff_nameGREEN.effects.map(
        (effect) => source.effects[effect.name as keyof typeof source.effects].particleGroup,
      ),
    ).toEqual(['eff_nameGREEN', 'eff_nameGREEN_1', 'eff_nameGREEN_2'])
    expect(source.groups.eff_nameGREEN.tags.every((tag) => tag.name === 'CENTER')).toBe(true)
    expect(particles.eff_nameGREEN!.blend).toBe(206)
    expect(particles.eff_nameINDIGO!.blend).toBe(203)
  })

  it('samples size in seconds and uses the source quad diameter, not normalised lifetime', () => {
    const green = particles.eff_nameGREEN!
    const sizeTrack = green.processes.find((process) => process.kind === 'dynamic')!.size!
    const atPeak = sizeTrack[1]!.time
    expect(titleSample(sizeTrack, atPeak, [0, 0])).toEqual([1, 1])
    expect(titleParticle(green, 0, atPeak)!.diameter).toBeCloseTo(2)
    const belowPeak = titleParticle(green, 0, sizeTrack[2]!.time)!
    expect(belowPeak.diameter).toBeCloseTo(1.6)
    expect(belowPeak.life).toBeGreaterThanOrEqual(0.6)
    expect(belowPeak.life).toBeLessThanOrEqual(0.7)
  })

  it('uses source green/alpha and fades a particle before it expires', () => {
    const green = particles.eff_nameGREEN!
    const young = titleParticle(green, 0, 0.04)!
    const grown = titleParticle(green, 0, 0.2)!
    expect(young.alpha).toBeLessThan(grown.alpha)
    expect(grown.alpha).toBe(20 / 255)
    expect(grown.color[0]).toBe(0)
    expect(grown.color[1]).toBeGreaterThanOrEqual(128)
    expect(grown.color[2]).toBe(0)
    expect(titleParticle(green, 0, grown.life - 0.02)!.alpha).toBeLessThan(grown.alpha)
  })

  it('retains 50 emissions per second with bounded slots and local upward motion', () => {
    const green = particles.eff_nameGREEN!
    expect(titleParticleCount(green)).toBe(35)
    expect(titleParticle(green, 1, 0)).toBeNull()
    const first = titleParticle(green, 0, 0.1)!
    const later = titleParticle(green, 0, 0.3)!
    expect(later.position[1]).toBeGreaterThan(first.position[1])
    expect(first.position[0]).toBeCloseTo(later.position[0])
    expect(first.position[2]).toBeCloseTo(later.position[2])
    for (const group of Object.values(particles)) {
      for (let index = 0; index < titleParticleCount(group); index++) {
        const particle = titleParticle(group, index, 10)
        if (!particle) continue
        expect(particle.position.every(Number.isFinite)).toBe(true)
        expect(particle.diameter).toBeGreaterThan(0)
        expect(particle.alpha).toBeGreaterThanOrEqual(0)
        expect(particle.alpha).toBeLessThanOrEqual(1)
      }
    }
  })
})
