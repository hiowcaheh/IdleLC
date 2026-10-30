/**
 * The monster book's rewards: killing a monster 10 / 100 / 1 000 / 10 000 times earns a reward each
 * (data/bookRewards.ts), claimed in order. Pure — the server runs the same rules.
 */
import { bookRewards, type BookReward } from '../data/bookRewards.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory } from './loot.ts'

type Booked = Pick<CharacterData, 'stats'>

/** Rewards of a monster already claimed (they go in order). */
export function claimedRewards(character: Booked, monsterId: string): number {
  return character.stats.bookClaims[monsterId] ?? 0
}

/** The next reward of a monster, if there is one left. */
export function nextReward(character: Booked, monsterId: string): BookReward | undefined {
  return bookRewards(monsterId)[claimedRewards(character, monsterId)]
}

/** Rewards that can be claimed now, over all monsters. */
export function claimableRewards(character: Booked): number {
  let count = 0
  for (const [monsterId, kills] of Object.entries(character.stats.monsterKills)) {
    const rewards = bookRewards(monsterId)
    for (let i = claimedRewards(character, monsterId); i < rewards.length; i++) {
      if (kills >= rewards[i]!.kills) count++
    }
  }
  return count
}

export interface BookClaim {
  character: CharacterData
  reward: BookReward
}

/** Claims a monster's next reward once its kills reach the milestone: the items go to the bag. */
export function applyClaimBookReward(character: CharacterData, monsterId: string): BookClaim {
  const claimed = claimedRewards(character, monsterId)
  const reward = bookRewards(monsterId)[claimed]
  if (!reward) throw new GameError('no-reward', monsterId)
  const kills = character.stats.monsterKills[monsterId] ?? 0
  if (kills < reward.kills) throw new GameError('not-reached', `${kills} / ${reward.kills}`)
  return {
    character: {
      ...character,
      inventory: addToInventory(character.inventory, reward.items),
      stats: {
        ...character.stats,
        bookClaims: { ...character.stats.bookClaims, [monsterId]: claimed + 1 },
      },
    },
    reward,
  }
}
