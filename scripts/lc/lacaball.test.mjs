import { describe, expect, it } from 'vitest'
import { buildLacaBallCourses } from './lacaball.mjs'

const rows = [5123, 5124, 6653].flatMap((token) =>
  Array.from({ length: 5 }, (_, course) =>
    [1, 5, 10, 30, 1000].map((max, order) => ({
      a_tocken_index: token,
      a_course_code: course,
      a_order: order,
      a_item_index: 85 + order,
      a_item_count: order + 1,
      a_item_max: max,
      a_item_remain: 0,
    })),
  ).flat(),
)
describe('modern t_lcball importer', () => {
  it('imports only Token and Gold Token with five ordered finite courses each', () => {
    const courses = buildLacaBallCourses([...rows].reverse())
    expect(courses.map((c) => c.id)).toEqual([100, 101, 102, 103, 104, 200, 201, 202, 203, 204])
    expect(courses[0].rewards).toEqual(
      [1, 5, 10, 30, 1000].map((max, i) => ({ itemId: 85 + i, count: i + 1, max })),
    )
    expect(courses.flatMap((c) => c.rewards).every((r) => !('remaining' in r))).toBe(true)
  })
  it('rejects missing rows and a jackpot stock different from one', () => {
    expect(() => buildLacaBallCourses(rows.slice(1))).toThrow('Invalid Laca Ball pool')
    expect(() =>
      buildLacaBallCourses(rows.map((r, i) => (i === 0 ? { ...r, a_item_max: 2 } : r))),
    ).toThrow('Invalid Laca Ball pool')
  })
})
