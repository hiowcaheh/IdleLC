import { describe, expect, it } from 'vitest'
import { bodyPart, coveredParts, gearLooks, gearModelUrl } from './gear.ts'

describe('gear on the character', () => {
  it('reads the body part from class model mesh names', () => {
    expect(bodyPart('ni_bu_000')).toBe('bu')
    expect(bodyPart('hw_bs_001_1')).toBe('bs')
    expect(bodyPart('ti_hair_000')).toBe('hair')
    expect(bodyPart('Bip01')).toBeNull()
  })

  it("covers the slot's body part and the parts the piece's meshes replace", () => {
    expect([...coveredParts('armor', ['ni_bu_001'])]).toEqual(['bu'])
    // a healer skirt: trousers and the skirt part of the body
    expect([...coveredParts('pants', ['hw_bd_001', 'hw_bs_001'])].sort()).toEqual(['bd', 'bs'])
    // a helmet hides the hair
    expect([...coveredParts('helmet', ['ti_hel_018', 'ti_hel_018_1'])].sort()).toEqual([
      'hair',
      'hel',
    ])
    // weapons and shields only add meshes
    expect([...coveredParts('weapon', ['ni_sword_000'])]).toEqual(['sword'])
  })

  it('shows nothing for pieces without a converted model (placeholder data has none)', () => {
    expect(gearModelUrl(5)).toBeNull()
    expect(gearLooks([5, 6])).toEqual([])
  })
})
