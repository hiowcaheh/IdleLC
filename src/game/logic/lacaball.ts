import { lacaBallCourse } from '../data/lacaball.ts'
import { ITEMS } from '../data/items.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, takeFromInventory, type ItemStack } from './loot.ts'
import { rollInt, type Rng } from './rng.ts'

/** Client: thirteen 100 ms shake frames, then a falling/bouncing capsule and reveal. */
export const LACABALL_DRAW_MS = 3200
export const LACABALL_RESET_MS = 24 * 60 * 60 * 1000
export interface LacaBallDraw {
  id: string
  characterId: string
  courseId: number
  tokenId: number
  cost: number
  startedAt: number
  prize: ItemStack
}
export interface LacaBallProgress {
  /** Completed/reserved plays on this account; source Connector resets after 24h inactivity. */
  repeat: number
  lastPlayedAt: number
  pending?: LacaBallDraw
}
export interface LacaBallStart {
  character: CharacterData
  progress: LacaBallProgress
  draw: LacaBallDraw
}
export interface LacaBallResult {
  character: CharacterData
  progress: LacaBallProgress
  prize: ItemStack
}

export function lacaBallRepeat(progress: LacaBallProgress | undefined, now: number) {
  return progress && now - progress.lastPlayedAt < LACABALL_RESET_MS ? progress.repeat : 0
}
export function lacaBallCost(courseId: number, tokenId: number, repeat: number): number | null {
  const stake = lacaBallCourse(courseId)?.stakes.find((s) => s.itemId === tokenId)
  return stake ? stake.base + (stake.increasing ? Math.floor(Math.max(1, repeat) / 5) : 0) : null
}

export function beginLacaBall(
  character: CharacterData,
  progress: LacaBallProgress | undefined,
  courseId: number,
  tokenId: number,
  id: string,
  now: number,
  rng: Rng,
): LacaBallStart {
  if (progress?.pending) throw new GameError('lacaball-pending')
  const course = lacaBallCourse(courseId)
  const repeat = lacaBallRepeat(progress, now)
  const cost = lacaBallCost(courseId, tokenId, repeat)
  if (!course || cost === null) throw new GameError('lacaball-invalid-stake')
  const { inventory, taken } = takeFromInventory(character.inventory, [
    { itemId: tokenId, count: cost },
  ])
  if (taken[0]?.count !== cost) throw new GameError('lacaball-not-enough-tokens')
  const roll = rollInt(rng, 1, 10000)
  let cumulative = 0
  const reward = course.rewards.find((r) => (cumulative += r.weight) >= roll)
  if (!reward || !ITEMS[reward.itemId]) throw new GameError('lacaball-invalid-reward')
  const draw: LacaBallDraw = {
    id,
    characterId: character.id,
    courseId,
    tokenId,
    cost,
    startedAt: now,
    prize: { itemId: reward.itemId, count: reward.count },
  }
  return {
    character: { ...character, inventory },
    progress: { repeat: repeat + 1, lastPlayedAt: now, pending: draw },
    draw,
  }
}

export function finishLacaBall(
  character: CharacterData,
  progress: LacaBallProgress | undefined,
  drawId: string,
  now: number,
): LacaBallResult {
  const draw = progress?.pending
  if (!draw || draw.id !== drawId || draw.characterId !== character.id)
    throw new GameError('lacaball-expired')
  if (now - draw.startedAt < LACABALL_DRAW_MS) throw new GameError('lacaball-not-ready')
  return {
    character: { ...character, inventory: addToInventory(character.inventory, [draw.prize]) },
    progress: { repeat: progress.repeat, lastPlayedAt: progress.lastPlayedAt },
    prize: { ...draw.prize },
  }
}

export function sanitizeLacaBall(
  raw: unknown,
  characterIds: string[],
): LacaBallProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as LacaBallProgress
  const uint = (n: unknown): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (!uint(value.repeat) || !uint(value.lastPlayedAt)) return undefined
  const result: LacaBallProgress = { repeat: value.repeat, lastPlayedAt: value.lastPlayedAt }
  const draw = value.pending
  if (
    draw &&
    typeof draw.id === 'string' &&
    draw.id &&
    characterIds.includes(draw.characterId) &&
    uint(draw.startedAt) &&
    uint(draw.cost) &&
    draw.cost > 0 &&
    lacaBallCost(draw.courseId, draw.tokenId, 0) !== null &&
    draw.prize &&
    uint(draw.prize.itemId) &&
    ITEMS[draw.prize.itemId] &&
    uint(draw.prize.count) &&
    draw.prize.count > 0
  ) {
    result.pending = {
      id: draw.id,
      characterId: draw.characterId,
      courseId: draw.courseId,
      tokenId: draw.tokenId,
      cost: draw.cost,
      startedAt: draw.startedAt,
      prize: { itemId: draw.prize.itemId, count: draw.prize.count },
    }
  }
  return result
}
