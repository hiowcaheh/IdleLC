/** Modern t_lcball stock limits; the owner authorizes rewards from IdleLC's usable items. */
import source from './generated/lc-lacaball.json'

export const TOKEN_ID = 5123
export const GOLD_TOKEN_ID = 5124
export const TOKEN_DROP_CHANCE = 0.01
export const LACABALL_TOKENS = [TOKEN_ID, GOLD_TOKEN_ID] as const

// Five tiers per course, with a single jackpot ticket. Gold Tokens stay shop-only.
const prizes = [
  [
    [95015, 1],
    [2548, 2],
    [85, 5],
    [2544, 5],
    [4917, 50],
  ],
  [
    [2548, 3],
    [1839, 3],
    [1288, 1],
    [2547, 3],
    [4920, 50],
  ],
  [
    [95016, 1],
    [2548, 3],
    [85, 10],
    [972, 10],
    [2544, 10],
  ],
  [
    [85, 10],
    [2548, 5],
    [1839, 5],
    [2453, 2],
    [4917, 100],
  ],
  [
    [95015, 2],
    [2548, 5],
    [1288, 2],
    [2547, 5],
    [4920, 100],
  ],
  [
    [95016, 3],
    [2548, 10],
    [85, 25],
    [2547, 15],
    [2544, 25],
  ],
  [
    [1839, 15],
    [2548, 10],
    [1288, 5],
    [2453, 5],
    [4917, 250],
  ],
  [
    [1288, 10],
    [2548, 15],
    [85, 50],
    [972, 20],
    [2544, 50],
  ],
  [
    [2548, 10],
    [1839, 10],
    [2547, 25],
    [1288, 5],
    [4920, 250],
  ],
  [
    [95016, 2],
    [2548, 20],
    [1839, 15],
    [2453, 5],
    [2544, 50],
  ],
] as const

export const LACABALL_COURSES = source.map((course, index) => ({
  ...course,
  name: `Course ${String.fromCharCode(65 + course.code)}`,
  rewards: course.rewards.map((r, i) => ({
    itemId: prizes[index]![i]![0],
    count: prizes[index]![i]![1],
    max: r.max,
  })),
}))
export const lacaBallCourse = (id: number) => LACABALL_COURSES.find((c) => c.id === id)
export const lacaBallCourses = (tokenId: number) =>
  LACABALL_COURSES.filter((c) => c.tokenId === tokenId)
