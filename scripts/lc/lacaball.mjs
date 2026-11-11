/** SubHelper/doFuncCommand.cpp: t_lcball has five finite reward rows per token/course. */
import { int } from './sql.mjs'

export function buildLacaBallCourses(rows) {
  return [5123, 5124].flatMap((tokenId, tokenIndex) =>
    Array.from({ length: 5 }, (_, code) => {
      const rewards = rows
        .filter((r) => int(r.a_tocken_index) === tokenId && int(r.a_course_code) === code)
        .sort((a, b) => int(a.a_order) - int(b.a_order))
        .map((r) => ({
          itemId: int(r.a_item_index),
          count: int(r.a_item_count),
          max: int(r.a_item_max),
        }))
      if (rewards.length !== 5 || rewards[0].max !== 1 || rewards.some((r) => r.max < 1))
        throw new Error(`Invalid Laca Ball pool ${tokenId}/${code}`)
      // Start a new local account with full stock, not another server's depleted snapshot.
      return { id: (tokenIndex + 1) * 100 + code, tokenId, code, rewards }
    }),
  )
}
