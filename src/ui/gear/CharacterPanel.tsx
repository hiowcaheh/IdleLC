import { useState } from 'react'
import { HEAVEN_STONE_ID, classSlots, getItem } from '../../game/data/items.ts'
import type { ClientCombatStats, EquipSlot } from '../../game/data/types.ts'
import { REGEN_TICK_SECONDS } from '../../game/logic/balance.ts'
import {
  MAX_COOLDOWN_REDUCTION,
  MAX_MP_COST_REDUCTION,
  effectiveStats,
} from '../../game/logic/combat.ts'
import { GameError } from '../../game/logic/character.ts'
import {
  MAX_PLUS,
  UPGRADE_RISK_FROM,
  stonesOwned,
  upgradeChance,
  type GearPiece,
} from '../../game/logic/equipment.ts'
import { rewardBonuses } from '../../game/logic/rewards.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { toast } from '../../state/toasts.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { ItemInfo } from '../items/ItemInfo.tsx'
import { ItemSlot } from '../items/ItemSlot.tsx'
import { useCombatTicker } from '../skills/useCombatTicker.ts'
import { Sheet } from '../Sheet.tsx'
import { SLOT_LABELS, fmt, heroStats, nameTone, pieceName } from './format.ts'
import { HeroCard } from './HeroCard.tsx'

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
/** Active play time: "45m", "12h 05m", "3d 4h". */
function playTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
  return `${minutes}m`
}

export function CharacterPanel({ onClose }: { onClose(): void }) {
  const character = useGameStore((s) => s.character)
  const unequipItem = useGameStore((s) => s.unequipItem)
  const upgradeItem = useGameStore((s) => s.upgradeItem)
  const [tab, setTab] = useState<Tab>('stats')
  const [selected, setSelected] = useState<EquipSlot | null>(null)
  const [busy, setBusy] = useState(false)
  const combat = useCombatTicker(500)
  if (!character) return null

  const away = character.expedition !== null
  // the fight's stats include the buffs on the hero right now; the gear-only ones are the base
  const base = heroStats(character)
  const stats = away ? base : effectiveStats(combat.player)
  const effects = away ? [] : combat.player.effects
  const castTime = stats.castTime ?? 0
  /** What the buffs on the hero change in a stat ("+25"), or nothing. */
  const change = (now: number, before: number, digits = 0) => {
    const d = Number((now - before).toFixed(digits))
    return d === 0 ? undefined : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(digits)}`
  }
  // recovery buffs and potions restore HP / MP per second: shown per regeneration tick too
  const perTick = (key: 'hpPerSecond' | 'mpPerSecond') =>
    effects.reduce((sum, e) => sum + (e[key] ?? 0), 0) * REGEN_TICK_SECONDS
  const hpRecovery = (stats.hpRegen ?? 0) + perTick('hpPerSecond')
  const mpRecovery = (stats.mpRegen ?? 0) + perTick('mpPerSecond')
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${percent(Math.abs(value))}`
  // rare options with the caps combat applies
  const capped = (value: number | undefined, cap: number) => Math.min(cap * 100, value ?? 0)
  type StatRow = [string, string, string?]
  const clientRow = (
    label: string,
    key: keyof ClientCombatStats,
    digits = 0,
    unit = '',
  ): StatRow => {
    const value = stats.client?.[key]
    const before = base.client?.[key]
    return [
      label,
      value === undefined ? '—' : `${digits ? value.toFixed(digits) : fmt(value)}${unit}`,
      value === undefined || before === undefined ? undefined : change(value, before, digits),
    ]
  }
  const attributeRows: StatRow[] = [
    ['Strength', fmt(stats.strength ?? 0), change(stats.strength ?? 0, base.strength ?? 0)],
    ['Dexterity', fmt(stats.dexterity ?? 0), change(stats.dexterity ?? 0, base.dexterity ?? 0)],
    [
      'Intelligence',
      fmt(stats.intelligence ?? 0),
      change(stats.intelligence ?? 0, base.intelligence ?? 0),
    ],
    [
      'Constitution',
      fmt(stats.constitution ?? 0),
      change(stats.constitution ?? 0, base.constitution ?? 0),
    ],
  ]
  const resourceRows: StatRow[] = [
    ['Health', fmt(stats.maxHp), change(stats.maxHp, base.maxHp)],
    ['Mana', fmt(stats.maxMp ?? 0), change(stats.maxMp ?? 0, base.maxMp ?? 0)],
  ]
  const combatRows: StatRow[] = [
    clientRow('Physical attack', 'physicalAttack'),
    clientRow('Magic attack', 'magicAttack'),
    clientRow('Physical defense', 'physicalDefense'),
    clientRow('Magic defense', 'magicDefense'),
    clientRow('Physical hit rate', 'physicalHit'),
    clientRow('Magic hit rate', 'magicHit'),
    clientRow('Physical evasion', 'physicalEvasion'),
    clientRow('Magic evasion', 'magicEvasion'),
    clientRow('Critical rating', 'criticalRating'),
    clientRow('Deadly rating', 'deadlyRating'),
  ]
  const combatBonusRows: StatRow[] = [
    [
      'Critical chance',
      percent(stats.critChance * 100),
      change(stats.critChance * 100, base.critChance * 100, 1),
    ],
    ['Critical damage', `×${stats.critMultiplier.toFixed(2)}`],
    ['Block chance', signed(stats.blockChance ?? 0)],
  ]
  const speedRows: StatRow[] = [
    clientRow('Run speed', 'runSpeed', 1, ' m/s'),
    clientRow('Walk speed', 'walkSpeed', 1, ' m/s'),
    [
      'Attack speed',
      `${stats.attackInterval.toFixed(2)} s`,
      change(stats.attackInterval, base.attackInterval, 2),
    ],
    ['Movement bonus', signed(stats.moveSpeed ?? 0)],
    [
      'Cast time',
      castTime === 0 ? 'Normal' : `${castTime > 0 ? '+' : '−'}${Math.abs(castTime).toFixed(1)} s`,
    ],
    ['Cast speed', signed(stats.castSpeed ?? 0)],
    ['Skill reuse time', `${(stats.reuseTime ?? 0).toFixed(1)} s`],
    ['Skill cooldown', signed(-capped(stats.cooldownReduction, MAX_COOLDOWN_REDUCTION))],
    ['Skill MP cost', signed(-capped(stats.mpCostReduction, MAX_MP_COST_REDUCTION))],
  ]
  const recoveryRows: StatRow[] = [
    [
      'HP recovery',
      `+${fmt(Math.round(hpRecovery))} / ${REGEN_TICK_SECONDS}s`,
      change(hpRecovery, base.hpRegen ?? 0),
    ],
    [
      'MP recovery',
      `+${fmt(Math.round(mpRecovery))} / ${REGEN_TICK_SECONDS}s`,
      change(mpRecovery, base.mpRegen ?? 0),
    ],
    ['HP steal', signed(stats.hpSteal ?? 0)],
    ['MP steal', signed(stats.mpSteal ?? 0)],
  ]
  const bonuses = rewardBonuses(character)
  const bonusRows: [string, number][] = [
    ['EXP', bonuses.exp],
    ['Skill points', bonuses.sp],
    ['Gold', bonuses.gold],
    ['Drop chance', bonuses.drop],
  ]
  const statGroups = [
    { name: 'Attributes', rows: attributeRows },
    { name: 'Health and mana', rows: resourceRows },
    { name: 'Combat', rows: combatRows },
    { name: 'Combat bonuses', rows: combatBonusRows },
    { name: 'Speed and skills', rows: speedRows },
    { name: 'Recovery', rows: recoveryRows },
  ]
  const stones = stonesOwned(character)
  const slots = classSlots(character.classId)

  const run = async (action: () => Promise<string>) => {
    if (busy) return
    setBusy(true)
    try {
      toast(await action())
    } catch (error) {
      toast(
        error instanceof GameError ? 'That is not possible right now.' : 'Something went wrong.',
        'error',
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
        <ItemInfo
          character={character}
          itemId={piece.itemId}
          plus={piece.plus}
          options={piece.options}
          rare={piece.rare}
        />
        <div className="item-row__actions">
          <div className="upgrade-row">
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
            {item.upgradeable && (
              <button
                type="button"
                className="button button--gold upgrade-button"
                disabled={busy || away || stones < 1 || piece.plus >= MAX_PLUS}
                onClick={() => upgrade(slot, piece)}
              >
                <span className="upgrade-button__text">
                  <span className="upgrade-button__title">
                    {piece.plus >= MAX_PLUS
                      ? `+${MAX_PLUS} maximum`
                      : `Upgrade to +${piece.plus + 1}`}
                  </span>
                  {piece.plus < MAX_PLUS && (
                    <span className="upgrade-button__meta">
                      {Math.round(upgradeChance(piece.plus) * 100)}% chance
                    </span>
                  )}
                </span>
                <span
                  className={`stone-count${stones < 1 ? ' is-none' : ''}`}
                  title={`Heaven Stones in your bag: ${fmt(stones)}`}
                >
                  <ItemIcon item={getItem(HEAVEN_STONE_ID)} size={28} />
                  <span className="stone-count__value">{fmt(stones)}</span>
                </span>
              </button>
            )}
          </div>
          {item.upgradeable ? (
            piece.plus >= UPGRADE_RISK_FROM &&
            piece.plus < MAX_PLUS && (
              <p className="item-row__note">
                From +{UPGRADE_RISK_FROM} a failed upgrade takes one + away.
              </p>
            )
          ) : (
            <p className="item-row__note">Accessories can't be upgraded.</p>
          )}
        </div>
      </>
    )
  }

  return (
    <Sheet title="Character" titleId="character-title" className="sheet--fixed" onClose={onClose}>
      <HeroCard character={character} />
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
          {statGroups.map(({ name, rows }) => (
            <section className="character-stats__group" aria-label={name} key={name}>
              <h3 className="character-stats__heading">{name}</h3>
              <dl className="hero-stats">
                {rows.map(([label, value, buffed]) => (
                  <div key={label}>
                    <dt>
                      <span>{label}</span>
                      {buffed && <span className="hero-stats__buff">{buffed}</span>}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <section className="character-stats__group" aria-label="Bonuses">
            <h3 className="character-stats__heading">Bonuses</h3>
            <dl className="hero-stats">
              {bonusRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{signed(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="character-stats__group" aria-label="Hunting record">
            <h3 className="character-stats__heading">Hunting record</h3>
            <dl className="hero-stats">
              <div>
                <dt>Kills</dt>
                <dd>{fmt(character.stats.kills)}</dd>
              </div>
              <div>
                <dt>Deaths</dt>
                <dd>{fmt(character.stats.deaths)}</dd>
              </div>
              <div>
                <dt>Expeditions</dt>
                <dd>{fmt(character.stats.expeditions)}</dd>
              </div>
              <div>
                <dt>Play time</dt>
                <dd>{playTime(character.stats.playSeconds)}</dd>
              </div>
            </dl>
          </section>
        </div>
      )}

      {tab === 'equipment' && (
        <div
          role="tabpanel"
          id="character-panel-equipment"
          aria-labelledby="character-tab-equipment"
        >
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

                    label={`${SLOT_LABELS[slot]}: ${name}`}
                    onClick={() => setSelected(selected === slot ? null : slot)}
                  />
                </div>
              )
            })}
          </div>
          <p className="sheet__meta">
            {selected && !character.equipment[selected]
              ? `${SLOT_LABELS[selected]}: nothing worn — the Inventory has your gear.`
              : 'Tap a piece to see it.'}
          </p>
          {selected && character.equipment[selected] && (
            <Sheet
              centered
              title={SLOT_LABELS[selected]}
              titleId="worn-piece-title"
              onClose={() => setSelected(null)}
            >
              <div className="item-details">{details(selected, character.equipment[selected])}</div>
            </Sheet>
          )}
          {away && <p className="sheet__meta">Gear can't be changed during an expedition.</p>}
        </div>
      )}
    </Sheet>
  )
}
