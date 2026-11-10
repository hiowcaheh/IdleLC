/** doFuncEvent.cpp do_EventNewMoonstone: one stone, one weighted source reward. */
import { moonstoneFor } from '../data/moonstones.ts'
import { ITEMS } from '../data/items.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, takeFromInventory, type ItemStack } from './loot.ts'
import { rollInt, type Rng } from './rng.ts'

export interface MoonstonePlay {
  character: CharacterData
  prize: ItemStack
  stoneId: number
}

export function applyMoonstonePlay(
  character: CharacterData,
  stoneId: number,
  rng: Rng,
): MoonstonePlay {
  const stone = moonstoneFor(stoneId)
  if (!stone) throw new GameError('not-a-moonstone')
  const { inventory, taken } = takeFromInventory(character.inventory, [
    { itemId: stoneId, count: 1 },
  ])
  if (taken[0]?.count !== 1) throw new GameError('not-enough-moonstones')
  const total = stone.rewards.reduce((sum, r) => sum + r.weight, 0)
  if (total < 2) throw new GameError('invalid-moonstone-rewards')
  const roll = rollInt(rng, 1, total)
  let cumulative = 0
  const reward = stone.rewards.find((r) => (cumulative += r.weight) >= roll)
  if (!reward || !ITEMS[reward.itemId]) throw new GameError('invalid-moonstone-reward')
  // The supplied normal-stone tables contain no weapons or gold jackpot.
  const prize = {
    itemId: reward.itemId,
    count: reward.count,
    ...(reward.flag ? { flag: reward.flag } : {}),
  }
  return {
    character: { ...character, inventory: addToInventory(inventory, [prize]) },
    prize,
    stoneId,
  }
}
