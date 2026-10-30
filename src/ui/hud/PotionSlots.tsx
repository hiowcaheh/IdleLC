import { useState } from 'react'
import { createPortal } from 'react-dom'
import { getItem } from '../../game/data/items.ts'
import type { ItemDef } from '../../game/data/types.ts'
import { potionsLeft } from '../../game/logic/combat.ts'
import {
  POTION_GROUPS,
  countOwned,
  fitsSlot,
  type PotionGroup,
  type PotionSlot,
} from '../../game/logic/potions.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { potionLine } from '../items/potionText.ts'
import { Sheet } from '../Sheet.tsx'
import { useCombatTicker } from '../skills/useCombatTicker.ts'

const LABELS: Record<PotionGroup, string> = { hp: 'HP potion', mp: 'MP potion' }

const EMPTY: ItemDef = { id: 0, name: 'Potion', type: 'potion', level: 0, price: 0 }

const fmt = (n: number) => n.toLocaleString('en-US')

/**
 * The HP and MP potion quick slots: the potion the player put in each, how many are left and
 * whether the hero drinks it by itself. A tap opens the slot to choose its potion.
 */
export function PotionSlots() {
  const character = useGameStore((s) => s.character)
  const combat = useCombatTicker(500)
  const [open, setOpen] = useState<PotionGroup | null>(null)
  if (!character) return null
  const away = character.expedition !== null

  const slot = (group: PotionGroup) => {
    const { itemId, auto } = character.potionSlots[group]
    // in a fight the session knows best (potions drunk and not reported yet)
    const supply = (combat.player.potions ?? []).find((p) => p.itemId === itemId)
    const count =
      itemId === null
        ? 0
        : supply && !away
          ? potionsLeft(combat.player, supply)
          : countOwned(character.inventory, itemId)
    const item = itemId === null ? EMPTY : getItem(itemId)
    const what = itemId === null ? 'empty' : `${item.name}: ${count}`
    const state = auto ? 'drunk automatically' : 'automatic use off'
    return (
      <button
        key={group}
        type="button"
        className={`potion-slot potion-slot--${group}${auto ? ' is-auto' : ''}${count === 0 ? ' is-empty' : ''}`}
        aria-label={`${LABELS[group]} slot — ${what}, ${state}`}
        title={`${LABELS[group]} slot — ${what}, ${state} (tap to choose)`}
        disabled={away}
        onClick={() => setOpen(group)}
      >
        <ItemIcon item={item} size={28} />
        {itemId !== null && <span className="potion-slot__count">{count}</span>}
        {itemId !== null && auto && <span className="potion-slot__auto">A</span>}
      </button>
    )
  }

  return (
    <div className="potion-slots" role="group" aria-label="Potions">
      {POTION_GROUPS.map(slot)}
      {open &&
        // a window of the game, not of the HUD corner it is opened from
        createPortal(
          <PotionSlotPicker group={open} onClose={() => setOpen(null)} />,
          document.body,
        )}
    </div>
  )
}

/** Choose the potion of a quick slot from the bag, turn its automatic use on or off. */
function PotionSlotPicker({ group, onClose }: { group: PotionGroup; onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const setPotionSlot = useGameStore((s) => s.setPotionSlot)
  const [busy, setBusy] = useState(false)
  if (!character) return null
  const current = character.potionSlots[group]
  const owned = character.inventory
    .filter((s) => s.count > 0 && fitsSlot(s.itemId, group))
    .map((s) => ({ ...s, item: getItem(s.itemId) }))
    .sort((a, b) => a.item.level - b.item.level || a.itemId - b.itemId)

  const put = async (slot: PotionSlot) => {
    if (busy) return
    setBusy(true)
    try {
      await setPotionSlot(group, slot)
    } catch {
      // the slot shows the saved state
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title={`${LABELS[group]} slot`} titleId="potion-slot-title" onClose={onClose}>
      <p className="sheet__meta">
        Your hero drinks only the potion in this slot — in fights and on expeditions.
      </p>
      <div className="potion-picker__actions">
        <button
          type="button"
          className={`button${current.auto ? ' button--gold' : ''}`}
          aria-pressed={current.auto}
          disabled={busy}
          onClick={() => put({ ...current, auto: !current.auto })}
        >
          Drink automatically: {current.auto ? 'on' : 'off'}
        </button>
        {current.itemId !== null && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => put({ ...current, itemId: null })}
          >
            Empty the slot
          </button>
        )}
      </div>
      {owned.length > 0 ? (
        <ul className="item-list">
          {owned.map(({ itemId, count, item }) => {
            const inSlot = itemId === current.itemId
            const tooHigh = item.level > character.level
            return (
              <li key={itemId} className={`item-row item-row--button${inSlot ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="item-row__main"
                  aria-pressed={inSlot}
                  disabled={busy || inSlot}
                  onClick={() => put({ ...current, itemId })}
                >
                  <ItemIcon item={item} />
                  <span className="item-row__body">
                    <span className="item-row__name">
                      {item.name} ×{fmt(count)}
                    </span>
                    <span className="item-row__meta">
                      {[
                        item.potion && potionLine(item.potion),
                        tooHigh ? `from level ${item.level}` : null,
                        inSlot ? 'in the slot' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="sheet__empty">
          No {group === 'hp' ? 'HP' : 'MP'} potions in your bag — the shop sells them.
        </p>
      )}
    </Sheet>
  )
}
