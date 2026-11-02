import { describe, expect, it } from 'vitest'
import { getSkill } from '../../game/data/skills.ts'
import { interpretEffect, skillRank } from '../../game/logic/skills.ts'
import { describeEffect } from './format.ts'

describe('recovery descriptions', () => {
  it('shows maximum-resource percentages distinctly from flat HP and MP', () => {
    const rank = skillRank(getSkill(1)!, 1)
    for (const [subtype, resource] of [
      [0, 'HP'],
      [1, 'MP'],
    ] as const) {
      const flat = interpretEffect({ type: 4, subtype, damageType: 0, power: 25 })!
      const percent = interpretEffect({ type: 4, subtype, damageType: 2, power: 25 })!
      expect(describeEffect(flat, rank)).toBe(`Restores 25 ${resource}`)
      expect(describeEffect(percent, rank)).toBe(`Restores 25% of max ${resource}`)
    }
  })
})
