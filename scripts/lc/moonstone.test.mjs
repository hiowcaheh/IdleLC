import { describe, expect, it } from 'vitest'
import { buildMoonstoneRewards, MOONSTONE_IDS } from './moonstone.mjs'

describe('Moonstone SQL import', () => {
  it('retains gift count, source flag, float weight and gift-index order for every client grade', () => {
    const table = MOONSTONE_IDS.flatMap((id) => [
      { a_type: id, a_giftindex: 501, a_giftcount: 3, a_giftprob: 0.3, a_giftflag: 9 },
      { a_type: id, a_giftindex: 85, a_giftcount: 2, a_giftprob: 6, a_giftflag: 0 },
    ])
    const imported = buildMoonstoneRewards({ t_moonstone_reward: table })
    expect(imported.map((s) => s.itemId)).toEqual(MOONSTONE_IDS)
    for (const s of imported)
      expect(s.rewards).toEqual([
        { itemId: 85, count: 2, weight: 60000, flag: 0 },
        { itemId: 501, count: 3, weight: 3000, flag: 9 },
      ])
    expect(() => buildMoonstoneRewards({ t_moonstone_reward: [] })).toThrow()
  })
})
