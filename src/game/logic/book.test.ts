import { describe, expect, it } from 'vitest'
import { HEAVEN_STONE_ID } from '../data/items.ts'
import { applyClaimBookReward, claimableRewards, claimedRewards, nextReward } from './book.ts'
import { createCharacterData, type CharacterData } from './character.ts'

const hero = (kills: number): CharacterData => {
  const c = createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0)
  return { ...c, stats: { ...c.stats, monsterKills: { 'rust-golem': kills } } }
}

describe('monster book rewards', () => {
  it('pays the milestones in order once the kills reach them', () => {
    const c = hero(150)
    expect(claimableRewards(c)).toBe(2)
    const first = applyClaimBookReward(c, 'rust-golem')
    expect(first.reward.kills).toBe(10)
    expect(first.character.inventory).toEqual([{ itemId: HEAVEN_STONE_ID, count: 1 }])
    expect(claimedRewards(first.character, 'rust-golem')).toBe(1)
    const second = applyClaimBookReward(first.character, 'rust-golem')
    expect(second.reward.kills).toBe(100)
    expect(second.character.inventory).toEqual([{ itemId: HEAVEN_STONE_ID, count: 3 }])
    expect(nextReward(second.character, 'rust-golem')?.kills).toBe(1000)
    expect(claimableRewards(second.character)).toBe(0)
    expect(() => applyClaimBookReward(second.character, 'rust-golem')).toThrow('not-reached')
  })

  it('has nothing to give past the last milestone', () => {
    const c = hero(20000)
    let character = c
    for (let i = 0; i < 4; i++) character = applyClaimBookReward(character, 'rust-golem').character
    expect(character.inventory).toEqual([{ itemId: HEAVEN_STONE_ID, count: 18 }])
    expect(() => applyClaimBookReward(character, 'rust-golem')).toThrow('no-reward')
  })
})
