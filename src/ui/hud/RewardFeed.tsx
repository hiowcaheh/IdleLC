import { Gold } from '../Gold.tsx'
import { useEffect, useState, type ReactNode } from 'react'
import { getItem } from '../../game/data/items.ts'
import { SP_UNIT } from '../../game/logic/skills.ts'
import { combatEvents } from '../../state/combatEvents.ts'
import { nameTone, optionText } from '../gear/format.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'

/** How long a group takes to rise through the feed (keep in step with the CSS animation). */
const RISE_MS = 3600
const MAX_GROUPS = 8

interface Line {
  kind: 'exp' | 'sp' | 'gold' | 'item' | 'option'
  content: ReactNode
}

/** What one kill (or one option) brought: its lines rise together. */
interface Group {
  id: number
  lines: Line[]
}

let nextId = 1
const fmt = (n: number) => n.toLocaleString('en-US')
/** Keep the server's 1/10 000 SP precision, including its minimum overlevelled reward. */
const spText = (units: number) =>
  (units / SP_UNIT).toLocaleString('en-US', { maximumFractionDigits: 4 })

/**
 * What a kill brought (drops with their icons, EXP, SP, gold) in a list on the left of the screen,
 * the newest at the bottom; options worn gear gains from play time too.
 */
export function RewardFeed() {
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const push = (lines: Line[]) => {
      if (lines.length === 0) return
      const id = nextId++
      setGroups((list) => [...list, { id, lines }].slice(-MAX_GROUPS))
      const timer = setTimeout(() => {
        timers.delete(timer)
        setGroups((list) => list.filter((g) => g.id !== id))
      }, RISE_MS)
      timers.add(timer)
    }
    const unsubscribe = combatEvents.subscribe((e) => {
      if (e.type === 'reward') {
        push([
          ...e.drops.map((d) => {
            const item = getItem(d.itemId)
            return {
              kind: 'item' as const,
              content: (
                <>
                  <ItemIcon item={item} size={22} />
                  <span className={`reward-feed__name${nameTone({ itemId: d.itemId })}`}>
                    {item.name}
                    {d.count > 1 ? ` ×${fmt(d.count)}` : ''}
                  </span>
                </>
              ),
            }
          }),
          // EXP, SP and gold of a kill share one line, so fast kills stay a short list
          ...(e.exp > 0 || e.sp > 0 || e.gold > 0
            ? [
                {
                  kind: 'exp' as const,
                  content: (
                    <>
                      {e.exp > 0 && <span>+{fmt(e.exp)} EXP</span>}
                      {e.sp > 0 && <span className="reward-feed__sp">+{spText(e.sp)} SP</span>}
                      {e.gold > 0 && <Gold amount={e.gold} prefix="+" />}
                    </>
                  ),
                },
              ]
            : []),
        ])
      } else if (e.type === 'optionGained') {
        push([
          {
            kind: 'option' as const,
            content: `${getItem(e.itemId).name}: ${optionText(e.option)}`,
          },
        ])
      } else if (e.type === 'reset') {
        setGroups([])
      }
    })
    return () => {
      unsubscribe()
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  return (
    <ul className="reward-feed" aria-label="Rewards">
      {groups.map((group) => (
        <li key={group.id} className="reward-feed__group">
          {group.lines.map((line, i) => (
            <span key={i} className={`reward-feed__entry reward-feed__entry--${line.kind}`}>
              {line.content}
            </span>
          ))}
        </li>
      ))}
    </ul>
  )
}
