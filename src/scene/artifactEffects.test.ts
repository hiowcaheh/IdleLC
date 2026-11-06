import { describe, expect, it } from 'vitest'
import { ARTIFACT_WINGS, activeArtifactVisual, artifactWingOpacity } from './artifactEffects.ts'

describe('Seraphim wings', () => {
  it('requires a live dungeon effect and removes the visual at expiry or on leaving', () => {
    const effect = { visual: 'Angel_wing03' as const, dungeon: true as const, remaining: 600 }
    expect(activeArtifactVisual([effect])).toBe('Angel_wing03')
    expect(activeArtifactVisual([{ ...effect, remaining: 0 }])).toBeUndefined()
    expect(activeArtifactVisual([{ ...effect, dungeon: undefined }])).toBeUndefined()
    expect(activeArtifactVisual([])).toBeUndefined()
  })

  it('uses the six CENTER layers with original delays and alpha instead of a ground sprite', () => {
    expect(ARTIFACT_WINGS.map((w) => w.tag)).toEqual(Array(6).fill('CENTER'))
    expect(ARTIFACT_WINGS.map((w) => w.delay)).toEqual([
      0,
      0,
      expect.closeTo(0.4),
      expect.closeTo(0.4),
      expect.closeTo(0.7),
      expect.closeTo(0.7),
    ])
    expect(new Set(ARTIFACT_WINGS.map((w) => w.asset.url)).size).toBe(2)
    for (const time of [1, 5, 599]) {
      const alpha = ARTIFACT_WINGS.map((w) => artifactWingOpacity(w, time))
      expect(alpha).toEqual([1, 1, 50 / 255, 50 / 255, 20 / 255, 20 / 255])
    }
  })
})
