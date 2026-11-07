/**
 * What was just bought in the Cash shop, on the left of the screen like the drops of a kill: one
 * line per item, appearing one after another, above the shop window.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getItem } from '../../game/data/items.ts'
import { purchaseFeed } from '../../state/purchases.ts'
import { fmt } from '../gear/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'

/** Keep in step with the reward feed's rise animation. */
const RISE_MS = 3600
/** Delay between the lines of one purchase. */
const STEP_MS = 280

interface Line {
  id: number
  itemId: number
  count: number
}
let nextId = 1

export function PurchaseFeed() {
  const [lines, setLines] = useState<Line[]>([])
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const later = (ms: number, run: () => void) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        run()
      }, ms)
      timers.add(timer)
    }
    const unsubscribe = purchaseFeed.subscribe((items) => {
      items.forEach((item, i) => {
        const id = nextId++
        later(i * STEP_MS, () => {
          setLines((list) => [...list, { id, ...item }].slice(-10))
          later(RISE_MS, () => setLines((list) => list.filter((l) => l.id !== id)))
        })
      })
    })
    return () => {
      unsubscribe()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])
  if (lines.length === 0) return null
  return createPortal(
    <ul className="reward-feed purchase-feed" aria-label="Bought">
      {lines.map((line) => {
        const item = getItem(line.itemId)
        return (
          <li key={line.id} className="reward-feed__group">
            <span className="reward-feed__entry purchase-feed__entry">
              <ItemIcon item={item} size={22} />
              <span className="reward-feed__name">
                {item.name}
                {line.count > 1 ? ` ×${fmt(line.count)}` : ''}
              </span>
            </span>
          </li>
        )
      })}
    </ul>,
    document.body,
  )
}
