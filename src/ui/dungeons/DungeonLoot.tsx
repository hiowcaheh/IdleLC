import { useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import type { DungeonRun } from '../../game/logic/dungeons.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { Gold } from '../Gold.tsx'
import { Sheet } from '../Sheet.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { drinkWithToast } from '../items/drinkWithToast.ts'
import { potionAtLevel } from '../../game/logic/combat.ts'
import { comparePotions, potionLine } from '../items/potionText.ts'
import { formatSp } from '../skills/format.ts'

export function DungeonLootSummary({ rewards }: { rewards: DungeonRun['rewards'] }) {
  return (
    <>
      <dl className="dungeon-loot__totals">
        <div>
          <dt>EXP earned</dt>
          <dd>{rewards.exp.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Gold earned</dt>
          <dd>
            <Gold amount={rewards.gold} />
          </dd>
        </div>
        <div>
          <dt>SP earned</dt>
          <dd>{formatSp(rewards.sp)}</dd>
        </div>
        <div>
          <dt>Items found</dt>
          <dd>{rewards.drops.reduce((n, d) => n + d.count, 0)}</dd>
        </div>
      </dl>
      {rewards.drops.length ? (
        <ul className="dungeon-loot__items">
          {rewards.drops.map((d) => {
            const item = getItem(d.itemId)
            return (
              <li key={d.itemId}>
                <ItemIcon item={item} size={32} />
                <span>{item.name}</span>
                <strong>×{d.count}</strong>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="sheet__meta">No items found yet.</p>
      )}
    </>
  )
}

export function DungeonLootButton() {
  const run = useGameStore((s) => s.dungeon)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'loot' | 'potions'>('loot')
  if (!run) return null
  return (
    <>
      <button
        type="button"
        className="icon-button hud__menu dungeon-loot-button"
        aria-label="Dungeon loot"
        title="Dungeon loot"
        onClick={() => {
          setTab('loot')
          setOpen(true)
        }}
      />
      {open && (
        <Sheet
          centered
          title="Dungeon loot"
          titleId="dungeon-loot-title"
          className="sheet--client dungeon-loot"
          onClose={() => setOpen(false)}
        >
          <div className="tabs dungeon-tabs" role="tablist" aria-label="Dungeon bag pages">
            {(['loot', 'potions'] as const).map((page) => (
              <button
                key={page}
                type="button"
                role="tab"
                className={`tabs__tab${page === tab ? ' is-active' : ''}`}
                aria-selected={page === tab}
                onClick={() => setTab(page)}
              >
                {page === 'loot' ? 'Loot' : 'Potions'}
              </button>
            ))}
          </div>
          <p className="sheet__meta">
            {tab === 'loot'
              ? 'Rewards earned during this run. They are already saved to your character. Time is paused while this window is open.'
              : 'Use potions from your inventory. Potions keep their original duration, including their remaining time after the run. Dungeon blessings end with the run.'}
          </p>
          {tab === 'loot' ? <DungeonLootSummary rewards={run.rewards} /> : <DungeonPotions />}
          <button type="button" className="button button--wide" onClick={() => setOpen(false)}>
            Return
          </button>
        </Sheet>
      )}
    </>
  )
}

/**
 * The bag's potions. The window stays open after a drink (owner's request, 2026-11-06), so several
 * can be drunk at once; the toast says what each changed, as on the field.
 */
function DungeonPotions() {
  const character = useGameStore((s) => s.character)!
  const [busy, setBusy] = useState(false)
  const potions = character.inventory
    .map((s) => ({ ...s, item: getItem(s.itemId) }))
    .filter((s) => s.count > 0 && s.item.potion)
    .sort((a, b) => comparePotions(a.item, b.item) || a.item.name.localeCompare(b.item.name))
  return potions.length ? (
    <ul className="dungeon-potions">
      {potions.map(({ itemId, count, item, flag }) => (
        <li key={`${itemId}-${flag ?? 0}`}>
          <ItemIcon item={item} size={32} />
          <div>
            <strong>
              {item.name}
              {flag ? ` Lv ${flag}` : ''} ×{count}
            </strong>
            <small>{potionLine(potionAtLevel(item.potion!, flag))}</small>
          </div>
          <button
            type="button"
            className="button"
            disabled={busy || item.level > character.level}
            aria-label={`Drink ${item.name}`}
            onClick={async () => {
              setBusy(true)
              await drinkWithToast(itemId, flag)
              setBusy(false)
            }}
          >
            Drink
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="sheet__meta">No potions in your bag.</p>
  )
}
