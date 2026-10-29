import { useState } from 'react'
import { CLASSES } from '../../game/data/classes.ts'
import { classSlots, getItem } from '../../game/data/items.ts'
import type { EquipSlot } from '../../game/data/types.ts'
import { REGEN_TICK_SECONDS } from '../../game/logic/balance.ts'
import { GameError } from '../../game/logic/character.ts'
import { MAX_PLUS, stonesOwned, upgradeChance, type GearPiece } from '../../game/logic/equipment.ts'
import { OPTION_PLAY_SECONDS } from '../../game/logic/options.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import {
  SLOT_LABELS,
  fmt,
  gearLine,
  heroStats,
  nameTone,
  optionTotals,
  pieceName,
  rareLabel,
} from './format.ts'
import { OptionList } from './OptionList.tsx'

type Tab = 'stats' | 'equipment'

const TABS: { id: Tab; label: string }[] = [
  { id: 'stats', label: 'Stats' },
  { id: 'equipment', label: 'Equipment' },
]

const percent = (value: number) => `${Number(value.toFixed(1))}%`

/**
 * The character card: every combat stat with the options of the worn gear added up, and the worn
 * gear (take pieces off, upgrade them with stones).
 */
export function CharacterPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const unequipItem = useGameStore((s) => s.unequipItem)
  const upgradeItem = useGameStore((s) => s.upgradeItem)
  const [tab, setTab] = useState<Tab>('stats')
  const [selected, setSelected] = useState<EquipSlot | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!character) return null

  const stats = heroStats(character)
  const options = optionTotals(character.equipment, character.classId)
  const nextOption = OPTION_PLAY_SECONDS - character.optionProgress
  const castTime = stats.castTime ?? 0
  const statRows: [string, string][] = [
    ['Health', fmt(stats.maxHp)],
    ['Mana', fmt(stats.maxMp ?? 0)],
    ['Attack', fmt(stats.attack)],
    ['Defense', fmt(stats.defense)],
    ['Attack speed', `${stats.attackInterval.toFixed(2)} s`],
    [
      'Cast time',
      castTime === 0 ? 'Normal' : `${castTime > 0 ? '+' : '−'}${Math.abs(castTime).toFixed(1)} s`,
    ],
    ['Critical chance', percent(stats.critChance * 100)],
    ['Critical damage', `×${stats.critMultiplier.toFixed(2)}`],
    ['Accuracy', `+${percent(stats.hit ?? 0)}`],
    ['Evasion', `+${percent(stats.dodge ?? 0)}`],
    ['HP recovery', `+${fmt(stats.hpRegen ?? 0)} / ${REGEN_TICK_SECONDS} s`],
    ['MP recovery', `+${fmt(stats.mpRegen ?? 0)} / ${REGEN_TICK_SECONDS} s`],
  ]
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
      const name = pieceName(piece.itemId, 0, piece.rare)
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
      <div className="tabs" role="tablist" aria-label="Character card">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`character-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`character-panel-${t.id}`}
            className={`tabs__tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' && (
        <div role="tabpanel" id="character-panel-stats" aria-labelledby="character-tab-stats">
          <dl className="hero-stats">
            {statRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="inventory__heading">Options on your gear</h3>
          <p className="sheet__meta">
            Next option on a worn piece in {Math.max(1, Math.ceil(nextOption / 60))} min of play
            (not on expeditions).
          </p>
          {options.length > 0 ? (
            <span className="option-list option-list--totals">
              {options.map((line) => (
                <span
                  key={line.text}
                  className={`option-list__item${line.helps ? '' : ' is-useless'}`}
                  title={line.note}
                >
                  {line.text}
                </span>
              ))}
            </span>
          ) : (
            <p className="sheet__empty">None of your worn pieces has options.</p>
          )}
          <h3 className="inventory__heading">Hunting record</h3>
          <dl className="hero-stats">
            <div>
              <dt>Kills</dt>
              <dd>{fmt(character.stats.kills)}</dd>
            </div>
            <div>
              <dt>Deaths</dt>
              <dd>{fmt(character.stats.deaths)}</dd>
            </div>
          </dl>
        </div>
      )}

      {tab === 'equipment' && (
        <div
          role="tabpanel"
          id="character-panel-equipment"
          aria-labelledby="character-tab-equipment"
        >
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
                      <span className={`item-row__name${piece ? nameTone(piece) : ''}`}>
                        {piece ? pieceName(piece.itemId, piece.plus, piece.rare) : 'Empty'}
                      </span>
                      {piece && (
                        <span className="item-row__meta">
                          {[rareLabel(piece), gearLine(piece.itemId, piece.plus, piece.rare)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                      {piece && <OptionList options={piece.options} classId={character.classId} />}
                    </span>
                  </button>
                  {open && piece && (
                    <div className="item-row__actions">
                      {item?.upgradeable && (
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
                      )}
                      <button
                        type="button"
                        className="button"
                        disabled={busy || away}
                        onClick={() =>
                          run(async () => {
                            await unequipItem(slot)
                            setSelected(null)
                            return `${pieceName(piece.itemId, piece.plus, piece.rare)} is back in your bag.`
                          })
                        }
                      >
                        Take off
                      </button>
                      {item?.upgradeable ? (
                        <p className="item-row__note">
                          Upgrade stones: {stones}
                          {stones < 1
                            ? ' — the shop sells them, monsters drop Smelting Stones.'
                            : '.'}
                          {piece.plus >= 3 && piece.plus < MAX_PLUS
                            ? ' A failure takes one + away.'
                            : ''}
                        </p>
                      ) : (
                        <p className="item-row__note">Accessories can't be upgraded.</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {away && <p className="sheet__meta">Gear can't be changed during an expedition.</p>}
        </div>
      )}
    </Sheet>
  )
}
