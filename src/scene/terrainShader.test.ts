import { describe, expect, it } from 'vitest'
import { layerShares, splatFragment } from './terrainShader.ts'

/** The layering as it was: each layer mixed over the ones before it by its mask. */
function sequential(colors: number[], masks: number[]): number {
  let ground = colors[0]!
  for (let k = 1; k < colors.length; k++) ground += (colors[k]! - ground) * masks[k - 1]!
  return ground
}

describe('terrain splat shares', () => {
  it('give the same ground as mixing the layers one over another', () => {
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let trial = 0; trial < 500; trial++) {
      const layers = 1 + Math.floor(random() * 12)
      const colors = Array.from({ length: layers }, random)
      // masks are often exactly 0 or 1, as in the map files
      const masks = Array.from({ length: layers - 1 }, () => {
        const r = random()
        return r < 0.4 ? 0 : r > 0.8 ? 1 : random()
      })
      const shares = layerShares(masks)
      const summed = shares.reduce((sum, share, k) => sum + share * colors[k]!, 0)
      expect(summed).toBeCloseTo(sequential(colors, masks), 12)
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    }
  })

  it('a layer covered by a full layer above, or with no mask here, gets no share', () => {
    expect(layerShares([0, 1, 0.5])).toEqual([0, 0, 0.5, 0.5])
  })

  it('reads each layer only behind its share, with explicit gradients', () => {
    const glsl = splatFragment(3, 1, (k) => `mask0.${'rgba'[k - 1]}`)
    expect(glsl).toContain('if (share0 > 0.0) ground += share0 * textureGrad(uLayer0')
    expect(glsl).toContain('if (share2 > 0.0) ground += share2 * textureGrad(uLayer2')
    expect(glsl.indexOf('float share2')).toBeLessThan(glsl.indexOf('float share1'))
    expect(glsl).not.toContain('texture2D(uLayer')
  })
})
