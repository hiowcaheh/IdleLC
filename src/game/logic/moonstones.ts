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

/** Visual roll time, independent of combat speed. The prize is claimed only after landing. */
export const MOONSTONE_SPIN_MS = 3000

export interface MoonstoneSpin {
  id: string
  stoneId: number
  prize: ItemStack
  startedAt: number
}

export interface MoonstoneStart {
  character: CharacterData
  spin: MoonstoneSpin
}

export function sanitizeMoonstoneSpin(raw: unknown): MoonstoneSpin | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const spin = raw as MoonstoneSpin
  const prize = spin.prize
  const integer = (n: unknown): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (
    typeof spin.id !== 'string' ||
    !spin.id ||
    !moonstoneFor(spin.stoneId) ||
    !integer(spin.startedAt) ||
    !prize ||
    !integer(prize.itemId) ||
    !ITEMS[prize.itemId] ||
    !integer(prize.count) ||
    prize.count < 1 ||
    (prize.flag !== undefined &&
      (!integer(prize.flag) || (prize.flag > 0 && ![498, 499, 500, 501].includes(prize.itemId))))
  )
    return undefined
  return {
    id: spin.id,
    stoneId: spin.stoneId,
    startedAt: spin.startedAt,
    prize: {
      itemId: prize.itemId,
      count: prize.count,
      ...(prize.flag ? { flag: prize.flag } : {}),
    },
  }
}

/** Reserve one stone and persist its single draw; nothing is added to the bag yet. */
export function beginMoonstonePlay(
  character: CharacterData,
  stoneId: number,
  id: string,
  now: number,
  rng: Rng,
): MoonstoneStart {
  if (character.moonstoneSpin) throw new GameError('moonstone-play-pending')
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
  const spin = { id, startedAt: now, prize, stoneId }
  return { character: { ...character, inventory, moonstoneSpin: spin }, spin }
}

/** Claim the reserved draw once, after the reel has stopped. Never re-roll on reload or retry. */
export function finishMoonstonePlay(
  character: CharacterData,
  spinId: string,
  now: number,
): MoonstonePlay {
  const spin = character.moonstoneSpin
  if (!spin || spin.id !== spinId) throw new GameError('moonstone-play-expired')
  if (now - spin.startedAt < MOONSTONE_SPIN_MS) throw new GameError('moonstone-play-not-ready')
  const awarded = { ...character, inventory: addToInventory(character.inventory, [spin.prize]) }
  delete awarded.moonstoneSpin
  return {
    character: awarded,
    prize: { ...spin.prize },
    stoneId: spin.stoneId,
  }
}
