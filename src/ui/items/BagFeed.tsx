/**
 * What just reached the bag (Cash shop purchases, opened boxes), on the left of the screen in the
 * look of a kill's drops: one line per item, one after another, above the open windows.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getItem } from '../../game/data/items.ts'
import { bagFeed } from '../../state/bagFeed.ts'
import { fmt, nameTone } from '../gear/format.ts'
import { ItemIcon } from './ItemIcon.tsx'

/** Keep in step with the reward feed's rise animation. */
const RISE_MS = 3600
/** Delay between the lines of one purchase. */
const STEP_MS = 280

interface Line {
  id: number
  itemId: number
  count: number
  flag?: number
}
let nextId = 1

export function BagFeed() {
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
    const unsubscribe = bagFeed.subscribe((items) => {
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
    <ul className="reward-feed bag-feed" aria-label="Added to the bag">
      {lines.map((line) => {
        const item = getItem(line.itemId)
        return (
          <li key={line.id} className="reward-feed__group">
            <span className="reward-feed__entry reward-feed__entry--item">
              <ItemIcon item={item} size={22} />
              <span className={`reward-feed__name${nameTone({ itemId: line.itemId })}`}>
                {item.name}
                {line.flag ? ` Lv ${line.flag}` : ''}
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
