import { LACABALL_COURSES, LACABALL_TOKENS, lacaBallCourse } from '../data/lacaball.ts'
import { ITEMS } from '../data/items.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, takeFromInventory, type ItemStack } from './loot.ts'
import { rollInt, type Rng } from './rng.ts'

export const LACABALL_DRAW_MS = 2000
export const LACABALL_AUTO_DRAW_MS = 1000
export const LACABALL_RESULT_MS = 1500
const LEGACY_DRAW_MS = 3200

export interface LacaBallDraw {
  id: string
  characterId: string
  courseId: number
  tokenId: number
  cost: number
  startedAt: number
  prize: ItemStack
  /** Absent only on a pre-v19 draw, already paid under the legacy rules. */
  rewardIndex?: number
  durationMs?: typeof LACABALL_DRAW_MS | typeof LACABALL_AUTO_DRAW_MS
}
export interface LacaBallProgress {
  /** One stock per currency/course, shared by the characters in the local account. */
  pools: Record<string, number[]>
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

export const lacaBallDrawDuration = (draw: LacaBallDraw) => draw.durationMs ?? LEGACY_DRAW_MS
/** ProcSubHelperLCBalluse: decreaseItemCount(pCoinItem, 1). No legacy repetition price. */
export const lacaBallCost = (courseId: number, tokenId: number): number | null =>
  lacaBallCourse(courseId)?.tokenId === tokenId ? 1 : null

export function lacaBallPool(progress: LacaBallProgress | undefined, courseId: number): number[] {
  const course = lacaBallCourse(courseId)
  return [...(progress?.pools[courseId] ?? course?.rewards.map((r) => r.max) ?? [])]
}

/** The client refreshes counts after the reveal; a reserved row must not disclose the prize. */
export function lacaBallDisplayPool(progress: LacaBallProgress | undefined, courseId: number) {
  const counts = lacaBallPool(progress, courseId)
  const pending = progress?.pending
  if (pending?.courseId === courseId && pending.rewardIndex !== undefined)
    counts[pending.rewardIndex]!++
  return counts
}

export function beginLacaBall(
  character: CharacterData,
  progress: LacaBallProgress | undefined,
  courseId: number,
  tokenId: number,
  id: string,
  now: number,
  rng: Rng,
  automatic = false,
): LacaBallStart {
  if (progress?.pending) throw new GameError('lacaball-pending')
  const course = lacaBallCourse(courseId)
  const cost = lacaBallCost(courseId, tokenId)
  if (!course || cost === null) throw new GameError('lacaball-invalid-stake')
  const { inventory, taken } = takeFromInventory(character.inventory, [
    { itemId: tokenId, count: cost },
  ])
  if (taken[0]?.count !== cost) throw new GameError('lacaball-not-enough-tokens')
  const pool = lacaBallPool(progress, courseId)
  const total = pool.reduce((n, count) => n + count, 0)
  if (total < 1) throw new GameError('lacaball-empty-pool')
  // Preserve SubHelper's zero-based roll and <= 0 boundary, including its first-row tie.
  let roll = rollInt(rng, 0, total - 1)
  const rewardIndex = pool.findIndex((remaining) => (roll -= remaining) <= 0 && remaining > 0)
  const reward = course.rewards[rewardIndex]
  if (!reward || !ITEMS[reward.itemId]) throw new GameError('lacaball-invalid-reward')
  pool[rewardIndex]!--
  const draw: LacaBallDraw = {
    id,
    characterId: character.id,
    courseId,
    tokenId,
    cost,
    startedAt: now,
    prize: { itemId: reward.itemId, count: reward.count },
    rewardIndex,
    durationMs: automatic ? LACABALL_AUTO_DRAW_MS : LACABALL_DRAW_MS,
  }
  return {
    character: { ...character, inventory },
    progress: { pools: { ...progress?.pools, [courseId]: pool }, pending: draw },
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
  if (now - draw.startedAt < lacaBallDrawDuration(draw)) throw new GameError('lacaball-not-ready')
  const pools = { ...progress.pools }
  // do_Command_LCBallsuccess: reset only the winning token/course, after successful payout.
  if (draw.rewardIndex === 0)
    pools[draw.courseId] = lacaBallCourse(draw.courseId)!.rewards.map((r) => r.max)
  return {
    character: { ...character, inventory: addToInventory(character.inventory, [draw.prize]) },
    progress: { pools },
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
  const pools: Record<string, number[]> = {}
  for (const course of LACABALL_COURSES) {
    const pool = value.pools?.[course.id]
    if (
      Array.isArray(pool) &&
      pool.length === course.rewards.length &&
      pool.every((n, i) => uint(n) && n <= course.rewards[i]!.max)
    )
      pools[course.id] = [...pool]
  }
  const result: LacaBallProgress = { pools }
  const draw = value.pending
  const course = draw && lacaBallCourse(draw.courseId)
  const legacy = draw && [1, 2, 3].includes(draw.courseId) && draw.rewardIndex === undefined
  if (
    draw &&
    typeof draw.id === 'string' &&
    draw.id &&
    characterIds.includes(draw.characterId) &&
    uint(draw.startedAt) &&
    uint(draw.cost) &&
    draw.cost > 0 &&
    (LACABALL_TOKENS as readonly number[]).includes(draw.tokenId) &&
    (legacy ||
      (course?.tokenId === draw.tokenId &&
        uint(draw.rewardIndex) &&
        draw.rewardIndex < course.rewards.length)) &&
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
      ...(!legacy ? { rewardIndex: draw.rewardIndex } : {}),
      ...(!legacy && [LACABALL_DRAW_MS, LACABALL_AUTO_DRAW_MS].includes(draw.durationMs!)
        ? { durationMs: draw.durationMs }
        : {}),
    }
    if (!legacy && !pools[draw.courseId]) {
      pools[draw.courseId] = course!.rewards.map((r) => r.max)
      pools[draw.courseId]![draw.rewardIndex!]!--
    }
  }
  for (const course of LACABALL_COURSES) {
    const pool = pools[course.id]
    const reservedJackpot =
      result.pending?.courseId === course.id && result.pending.rewardIndex === 0
    if (pool && pool[0] === 0 && !reservedJackpot) delete pools[course.id]
  }
  return result
}
