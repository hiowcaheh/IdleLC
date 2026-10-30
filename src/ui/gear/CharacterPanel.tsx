import { useState } from 'react'
import { CLASSES } from '../../game/data/classes.ts'
import { classSlots, getItem } from '../../game/data/items.ts'
import type { EquipSlot } from '../../game/data/types.ts'
import { REGEN_TICK_SECONDS } from '../../game/logic/balance.ts'
import {
  MAX_COOLDOWN_REDUCTION,
  MAX_MP_COST_REDUCTION,
  effectiveStats,
} from '../../game/logic/combat.ts'
import { GameError } from '../../game/logic/character.ts'
import { MAX_PLUS, stonesOwned, upgradeChance, type GearPiece } from '../../game/logic/equipment.ts'
import { OPTION_PLAY_SECONDS } from '../../game/logic/options.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { ItemSlot } from '../items/ItemSlot.tsx'
import { useCombatTicker } from '../skills/useCombatTicker.ts'
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

/** The client's equipment board (246 × 155 px): top left corner of each slot frame (34 px). */
const BOARD = { width: 246, height: 155, frame: 34 }
const FRAMES: Record<EquipSlot, [number, number]> = {
  accessory1: [30, 8],
  accessory2: [30, 43],
  accessory3: [30, 78],
  helmet: [106, 8],
  armor: [106, 43],
  pants: [106, 78],
  boots: [106, 113],
  weapon: [71, 61],
  gloves: [71, 96],
  shield: [142, 26],
}

/**
 * The character card: every combat stat with the options of the worn gear added up, and the worn
 * gear on the client's equipment board of the class (tap a slot: take it off, upgrade it).
 */
export function CharacterPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const unequipItem = useGameStore((s) => s.unequipItem)
  const upgradeItem = useGameStore((s) => s.upgradeItem)
  const [tab, setTab] = useState<Tab>('stats')
  const [selected, setSelected] = useState<EquipSlot | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const combat = useCombatTicker(500)
  if (!character) return null

  const away = character.expedition !== null
  // the fight's stats include the buffs on the hero right now; the gear-only ones are the base
  const base = heroStats(character)
  const stats = away ? base : effectiveStats(combat.player)
  const buffs = away ? [] : combat.player.effects.map((e) => e.name)
  const options = optionTotals(character.equipment, character.classId)
  const nextOption = OPTION_PLAY_SECONDS - character.optionProgress
  const castTime = stats.castTime ?? 0
  /** What the buffs on the hero change in a stat ("+25"), or nothing. */
  const change = (now: number, before: number, digits = 0) => {
    const d = Number((now - before).toFixed(digits))
    return d === 0 ? undefined : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}`
  }
  const statRows: [string, string, string?][] = [
    ['Health', fmt(stats.maxHp), change(stats.maxHp, base.maxHp)],
    ['Mana', fmt(stats.maxMp ?? 0), change(stats.maxMp ?? 0, base.maxMp ?? 0)],
    ['Attack', fmt(stats.attack), change(stats.attack, base.attack)],
    ['Defense', fmt(stats.defense), change(stats.defense, base.defense)],
    [
      'Attack speed',
      `${stats.attackInterval.toFixed(2)} s`,
      change(stats.attackInterval, base.attackInterval, 2),
    ],
    [
      'Cast time',
      castTime === 0 ? 'Normal' : `${castTime > 0 ? '+' : '−'}${Math.abs(castTime).toFixed(1)} s`,
    ],
    [
      'Critical chance',
      percent(stats.critChance * 100),
      change(stats.critChance * 100, base.critChance * 100, 1),
    ],
    ['Critical damage', `×${stats.critMultiplier.toFixed(2)}`],
    ['Accuracy', `+${percent(stats.hit ?? 0)}`, change(stats.hit ?? 0, base.hit ?? 0, 1)],
    ['Evasion', `+${percent(stats.dodge ?? 0)}`, change(stats.dodge ?? 0, base.dodge ?? 0, 1)],
    ['HP recovery', `+${fmt(stats.hpRegen ?? 0)} / ${REGEN_TICK_SECONDS} s`],
    ['MP recovery', `+${fmt(stats.mpRegen ?? 0)} / ${REGEN_TICK_SECONDS} s`],
  ]
  // rare options: shown when the gear has them (with the caps combat applies)
  const capped = (value: number | undefined, cap: number) => Math.min(cap * 100, value ?? 0)
  const extras: [string, number][] = [
    ['Skill cooldown', -capped(stats.cooldownReduction, MAX_COOLDOWN_REDUCTION)],
    ['Skill MP cost', -capped(stats.mpCostReduction, MAX_MP_COST_REDUCTION)],
    ['HP steal', stats.hpSteal ?? 0],
    ['MP steal', stats.mpSteal ?? 0],
    ['Move speed', stats.moveSpeed ?? 0],
  ]
  for (const [label, value] of extras) {
    if (value !== 0) statRows.push([label, `${value > 0 ? '+' : '−'}${percent(Math.abs(value))}`])
  }
  const stones = stonesOwned(character)
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

  /** The worn piece of a slot: what it gives, upgrade and take off. */
  const details = (slot: EquipSlot, piece: GearPiece) => {
    const item = getItem(piece.itemId)
    return (
      <>
        <div className="bag-details__head">
          <ItemIcon item={item} />
          <span className="item-row__body">
            <span className="gear-slot__label">{SLOT_LABELS[slot]}</span>
            <span className={`item-row__name${nameTone(piece)}`}>
              {pieceName(piece.itemId, piece.plus, piece.rare)}
            </span>
            <span className="item-row__meta">
              {[rareLabel(piece), gearLine(piece.itemId, piece.plus, piece.rare)]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <OptionList options={piece.options} classId={character.classId} />
          </span>
        </div>
        <div className="item-row__actions">
          {item.upgradeable && (
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
          {item.upgradeable ? (
            <p className="item-row__note">
              Heaven Stones: {stones}
              {stones < 1
                ? ' — the shop sells them; 10 Smelting Stones from monsters make one (Inventory).'
                : '.'}
              {piece.plus >= 3 && piece.plus < MAX_PLUS ? ' A failure takes one + away.' : ''}
            </p>
          ) : (
            <p className="item-row__note">Accessories can't be upgraded.</p>
          )}
        </div>
      </>
    )
  }

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
            {statRows.map(([label, value, buffed]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {value}
                  {buffed && <span className="hero-stats__buff"> ({buffed})</span>}
                </dd>
              </div>
            ))}
          </dl>
          {buffs.length > 0 && (
            <p className="sheet__meta">
              Active now: {buffs.join(', ')} (in brackets: what they add).
            </p>
          )}
          <h3 className="inventory__heading">Options on your gear</h3>
          <p className="sheet__meta">
            Next option on a worn piece in {Math.max(1, Math.ceil(nextOption / 60))} min of play
            (not on expeditions).
          </p>
          {options.length > 0 ? (
            <span className="option-list option-list--totals">
              {options.map((line) => (
                <span key={line.text} className="option-list__item" title={line.note}>
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
          <div
            className="equip-board"
            style={{
              backgroundImage: `url(${import.meta.env.BASE_URL}ui/lc/equip-${character.classId}.webp)`,
            }}
          >
            {slots.map((slot) => {
              const piece = character.equipment[slot]
              const [x, y] = FRAMES[slot]
              const name = piece ? pieceName(piece.itemId, piece.plus, piece.rare) : 'empty'
              return (
                <div
                  key={slot}
                  className="equip-board__slot"
                  style={{
                    left: `${(x / BOARD.width) * 100}%`,
                    top: `${(y / BOARD.height) * 100}%`,
                    width: `${(BOARD.frame / BOARD.width) * 100}%`,
                  }}
                >
                  <ItemSlot
                    item={piece ? getItem(piece.itemId) : undefined}
                    plus={piece?.plus}
                    tone={piece ? nameTone(piece) : ''}
                    selected={selected === slot}
                    size={36}
                    label={`${SLOT_LABELS[slot]}: ${name}`}
                    onClick={() => setSelected(selected === slot ? null : slot)}
                  />
                </div>
              )
            })}
          </div>
          {selected && character.equipment[selected] ? (
            <div className="bag-details">{details(selected, character.equipment[selected])}</div>
          ) : (
            <p className="sheet__meta">
              {selected
                ? `${SLOT_LABELS[selected]}: nothing worn.`
                : 'Tap a slot to see the piece.'}
            </p>
          )}
          {away && <p className="sheet__meta">Gear can't be changed during an expedition.</p>}
        </div>
      )}
    </Sheet>
  )
}
