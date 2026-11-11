/** Source costs/weights; prize contents are the owner's requested IdleLC selection. */
import source from './generated/lc-lacaball.json'

export const TOKEN_ID = 5123
export const GOLD_TOKEN_ID = 5124
export const TOKEN_DROP_CHANCE = 0.01

// Jackpot first, then decreasing rarity. Gold Tokens are exclusively sold in the ItemShop.
const prizes = [
  [
    [95015, 1],
    [2548, 2],
    [85, 5],
    [1839, 3],
    [1288, 1],
    [2547, 3],
    [2453, 1],
    [2544, 5],
    [4917, 50],
    [4920, 50],
  ],
  [
    [95016, 1],
    [2548, 3],
    [85, 10],
    [1839, 5],
    [1288, 2],
    [2547, 5],
    [2453, 2],
    [2544, 10],
    [4917, 100],
    [4920, 100],
  ],
  [
    [95016, 3],
    [95015, 1],
    [2548, 10],
    [85, 25],
    [1839, 10],
    [1288, 5],
    [2453, 5],
    [2547, 15],
    [2544, 25],
    [4917, 250],
  ],
] as const

export const LACABALL_COURSES = source.map((course, index) => ({
  ...course,
  name: ['Course A', 'Course B', 'Gold Course'][index]!,
  rewards: course.rewards.map((r, i) => ({
    itemId: prizes[index]![i]![0],
    count: prizes[index]![i]![1],
    weight: r.weight,
  })),
}))
export const lacaBallCourse = (id: number) => LACABALL_COURSES.find((c) => c.id === id)
