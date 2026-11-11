/** LacaRette.cpp: the three live courses, two currencies and ten weighted prizes. */
import { int } from './sql.mjs'

export function buildLacaBallCourses(rows) {
  return [1, 2, 3].map((id) => {
    const row = rows.find((r) => int(r.a_index) === id && int(r.a_enable) === 1)
    if (!row) throw new Error(`Missing Laca Ball course ${id}`)
    const numbers = (field) => String(row[field]).trim().split(/\s+/).map(Number)
    const tokens = numbers('a_coinIndex')
    const base = numbers('a_coinDefCount')
    const added = numbers('a_coinAddCount')
    const rewards = Array.from({ length: 10 }, (_, i) => {
      const [itemId, count, flag, weight, mask] = numbers(`a_giveItem_${i + 1}`)
      return { itemId, count, flag, weight, mask }
    })
    if (rewards.reduce((n, r) => n + r.weight, 0) !== 10000)
      throw new Error(`Invalid Laca Ball weights ${id}`)
    return {
      id,
      stakes: tokens.map((itemId, i) => ({ itemId, base: base[i], increasing: added[i] === 1 })),
      rewards,
    }
  })
}
