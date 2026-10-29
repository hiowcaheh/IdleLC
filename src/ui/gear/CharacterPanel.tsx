import { useState } from 'react'
import { CLASSES } from '../../game/data/classes.ts'
import { classSlots, getItem } from '../../game/data/items.ts'
import type { EquipSlot } from '../../game/data/types.ts'
import { GameError } from '../../game/logic/character.ts'
import { MAX_PLUS, stonesOwned, upgradeChance, type GearPiece } from '../../game/logic/equipment.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { SLOT_LABELS, fmt, gearLine, heroStats, pieceName } from './format.ts'

/** The hero's stats and worn gear: take pieces off and upgrade them with Smelting Stones. */
export function CharacterPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const unequipItem = useGameStore((s) => s.unequipItem)
  const upgradeItem = useGameStore((s) => s.upgradeItem)
  const [selected, setSelected] = useState<EquipSlot | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!character) return null

  const stats = heroStats(character)
  const stones = stonesOwned(character)
  const away = character.expedition !== null
  const slots = classSlots(character.classId)

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      setMessage(await action())
    } catch (error) {
      setMessage(
        error instanceof GameError ? 'That is not possible right now.' : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  const upgrade = (slot: EquipSlot, piece: GearPiece) =>
    run(async () => {
      const r = await upgradeItem(slot)
      const name = getItem(piece.itemId).name
      if (r.success) return `Success! ${name} is now +${r.plusAfter}.`
      return r.plusAfter < r.plusBefore
        ? `The upgrade failed: ${name} dropped to +${r.plusAfter}.`
        : `The upgrade failed. ${name} stays +${r.plusAfter}.`
    })

  return (
    <Sheet title="Character" titleId="character-title" onClose={onClose}>
      <p className="sheet__meta">
        {character.name} · {CLASSES[character.classId].name} · Level {character.level}
      </p>
      <dl className="hero-stats">
        <div>
          <dt>Health</dt>
          <dd>{fmt(stats.maxHp)}</dd>
        </div>
        <div>
          <dt>Mana</dt>
          <dd>{fmt(stats.maxMp ?? 0)}</dd>
        </div>
        <div>
          <dt>Attack</dt>
          <dd>{fmt(stats.attack)}</dd>
        </div>
        <div>
          <dt>Defense</dt>
          <dd>{fmt(stats.defense)}</dd>
        </div>
        <div>
          <dt>Attack speed</dt>
          <dd>{stats.attackInterval.toFixed(2)} s</dd>
        </div>
        <div>
          <dt>Critical</dt>
          <dd>
            {Math.round(stats.critChance * 100)}% ×{stats.critMultiplier.toFixed(1)}
          </dd>
        </div>
      </dl>

      <p className="inventory__status" role="status">
        {message ?? ''}
      </p>
      <ul className="item-list">
        {slots.map((slot) => {
          const piece = character.equipment[slot]
          const open = selected === slot && piece
          const item = piece ? getItem(piece.itemId) : null
          return (
            <li
              key={slot}
              className={`item-row item-row--button gear-slot${open ? ' is-open' : ''}${piece ? '' : ' is-empty'}`}
            >
              <button
                type="button"
                className="item-row__main"
                aria-expanded={Boolean(open)}
                disabled={!piece}
                onClick={() => setSelected(open ? null : slot)}
              >
                {item ? (
                  <ItemIcon item={item} />
                ) : (
                  <span className="item-icon" aria-hidden="true" />
                )}
                <span className="item-row__body">
                  <span className="gear-slot__label">{SLOT_LABELS[slot]}</span>
                  <span className="item-row__name">
                    {piece ? pieceName(piece.itemId, piece.plus) : 'Empty'}
                  </span>
                  {piece && (
                    <span className="item-row__meta">{gearLine(piece.itemId, piece.plus)}</span>
                  )}
                </span>
              </button>
              {open && piece && (
                <div className="item-row__actions">
                  <button
                    type="button"
                    className="button button--gold"
                    disabled={busy || away || stones < 1 || piece.plus >= MAX_PLUS}
                    onClick={() => upgrade(slot, piece)}
                  >
                    {piece.plus >= MAX_PLUS
                      ? `+${MAX_PLUS} — maximum`
                      : `Upgrade to +${piece.plus + 1} · ${Math.round(upgradeChance(piece.plus) * 100)}%`}
                  </button>
                  <button
                    type="button"
                    className="button"
                    disabled={busy || away}
                    onClick={() =>
                      run(async () => {
                        await unequipItem(slot)
                        setSelected(null)
                        return `${pieceName(piece.itemId, piece.plus)} is back in your bag.`
                      })
                    }
                  >
                    Take off
                  </button>
                  <p className="item-row__note">
                    Upgrade stones: {stones}
                    {stones < 1 ? ' — the shop sells them, monsters drop Smelting Stones.' : '.'}
                    {piece.plus >= 3 && piece.plus < MAX_PLUS ? ' A failure takes one + away.' : ''}
                  </p>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {away && <p className="sheet__meta">Gear can't be changed during an expedition.</p>}
    </Sheet>
  )
}
