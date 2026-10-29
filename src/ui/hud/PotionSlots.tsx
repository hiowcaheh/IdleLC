import { useState } from 'react'
import { getItem } from '../../game/data/items.ts'
import type { ItemDef } from '../../game/data/types.ts'
import { potionsLeft, type PotionKind } from '../../game/logic/combat.ts'
import type { PotionAuto } from '../../game/logic/character.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { useCombatTicker } from '../skills/useCombatTicker.ts'

type Group = keyof PotionAuto

const KINDS: Record<Group, PotionKind[]> = { hp: ['hp', 'hpRegen'], mp: ['mp', 'mpRegen'] }
const LABELS: Record<Group, string> = { hp: 'HP potions', mp: 'MP potions' }

const EMPTY: ItemDef = { id: 0, name: 'Potion', type: 'potion', level: 0, price: 0 }

/**
 * Quick slots of the HP and MP potions: how many the hero has left and whether it drinks them by
 * itself. A tap turns the automatic use on or off.
 */
export function PotionSlots() {
  const character = useGameStore((s) => s.character)
  const setPotionAuto = useGameStore((s) => s.setPotionAuto)
  const combat = useCombatTicker(500)
  const [busy, setBusy] = useState(false)
  if (!character) return null
  const away = character.expedition !== null

  const slot = (group: Group) => {
    const kinds = KINDS[group]
    const auto = character.potionAuto[group]
    const owned = character.inventory
      .map((s) => ({ ...s, item: getItem(s.itemId) }))
      .filter(
        ({ item, count }) =>
          count > 0 &&
          item.potion &&
          kinds.includes(item.potion.kind) &&
          item.level <= character.level,
      )
      .sort((a, b) => kinds.indexOf(a.item.potion!.kind) - kinds.indexOf(b.item.potion!.kind))
    // in a fight the session knows best (potions drunk and not reported yet)
    const supply = (combat.player.potions ?? []).filter((p) => kinds.includes(p.potion.kind))
    const count =
      auto && !away
        ? supply.reduce((n, p) => n + potionsLeft(combat.player, p), 0)
        : owned.reduce((n, s) => n + s.count, 0)
    const icon = owned[0]?.item ?? EMPTY
    const toggle = async () => {
      setBusy(true)
      try {
        await setPotionAuto({ ...character.potionAuto, [group]: !auto })
      } catch {
        // the slot shows the saved state
      } finally {
        setBusy(false)
      }
    }
    const state = auto ? 'drunk automatically' : 'automatic use off'
    return (
      <button
        key={group}
        type="button"
        className={`potion-slot potion-slot--${group}${auto ? ' is-auto' : ''}${count === 0 ? ' is-empty' : ''}`}
        aria-pressed={auto}
        aria-label={`${LABELS[group]}: ${count}, ${state}`}
        title={`${LABELS[group]}: ${count} — ${state} (tap to switch)`}
        disabled={busy || away}
        onClick={toggle}
      >
        <ItemIcon item={icon} size={22} />
        <span className="potion-slot__count">{count}</span>
        {auto && <span className="potion-slot__auto">A</span>}
      </button>
    )
  }

  return (
    <div className="potion-slots" role="group" aria-label="Potions">
      {slot('hp')}
      {slot('mp')}
    </div>
  )
}
