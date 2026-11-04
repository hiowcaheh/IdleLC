import { describe, expect, it } from 'vitest'
import { Writer } from './test-utils.mjs'
import { parseAnimationEffects } from './anim-effects.mjs'

describe('source AEFF animation event table', () => {
  it('keeps separate named groups, signed start time and loop flags', () => {
    const bytes = new Writer()
      .id('AEFF')
      .u32(1)
      .id('ANEF')
      .u8(1)
      .string('hw_skill_01')
      .u32(2)
      .string('Healer Heal 01')
      .f32(0.25)
      .u32(3)
      .string('')
      .f32(-0.5)
      .u32(0)
      .toBuffer()
    expect(parseAnimationEffects(bytes)).toEqual({
      hw_skill_01: [
        { group: 'Healer Heal 01', delay: 0.25, flags: 3 },
        { group: '', delay: -0.5, flags: 0 },
      ],
    })
    expect(() => parseAnimationEffects(Buffer.concat([bytes, Buffer.from([0])]))).toThrow(
      /trailing/,
    )
    expect(() => parseAnimationEffects(bytes.subarray(0, bytes.length - 1))).toThrow()
  })
})
