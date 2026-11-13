import { useState } from 'react'
import { HEAVEN_STONE_ID, classSlots, getItem } from '../../game/data/items.ts'
import type { ClientCombatStats, CombatStats, EquipSlot } from '../../game/data/types.ts'
import { REGEN_TICK_SECONDS } from '../../game/logic/balance.ts'
import { ATTRIBUTE_KEYS } from '../../game/logic/attributes.ts'
import { availableStatPoints } from '../../game/logic/statPoints.ts'
import { naturalRecovery } from '../../game/logic/recovery.ts'
import { effectRewardMultipliers, effectiveStats, runSpeed } from '../../game/logic/combat.ts'
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
import { STAT_TOAST_MS, toast } from '../../state/toasts.ts'
import { statChanges, withStatChanges } from '../statChanges.tsx'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { ItemInfo } from '../items/ItemInfo.tsx'
import { ItemSlot } from '../items/ItemSlot.tsx'
import { useCombatTicker } from '../skills/useCombatTicker.ts'
import { Sheet } from '../Sheet.tsx'
import { SLOT_LABELS, fmt, heroStats, nameTone, pieceName } from './format.ts'
import { HeroCard } from './HeroCard.tsx'
import { SpeedHelp } from './SpeedHelp.tsx'

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
  const allocateStatPoint = useGameStore((s) => s.allocateStatPoint)
  const [tab, setTab] = useState<Tab>('stats')
  const [selected, setSelected] = useState<EquipSlot | null>(null)
  const [busy, setBusy] = useState(false)
  const [speedHelpOpen, setSpeedHelpOpen] = useState(false)
  const combat = useCombatTicker(500)
  if (!character) return null

  const away = character.expedition !== null
  const locked = away || !!character.dungeons?.active
  const points = availableStatPoints(character)
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
  const recovery = naturalRecovery(stats, !away)
  const baseRecovery = naturalRecovery(base, !away)
  const hpRecovery = recovery.hp + perTick('hpPerSecond')
  const mpRecovery = recovery.mp + perTick('mpPerSecond')
  const signed = (value: number) => `${value < 0 ? '−' : '+'}${percent(Math.abs(value))}`
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
      value === undefined ? 'N/A' : `${digits ? value.toFixed(digits) : fmt(value)}${unit}`,
      value === undefined || before === undefined ? undefined : change(value, before, digits),
    ]
  }
  // A title's All Stats is shown on the attributes without changing combat (CmdMsg.cpp:539).
  const shown = (key: 'strength' | 'dexterity' | 'intelligence' | 'constitution'): StatRow => {
    const value = (stats[key] ?? 0) + (stats.shownAttributeBonus ?? 0)
    const label = key[0]!.toUpperCase() + key.slice(1)
    return [label, fmt(value), change(value, (base[key] ?? 0) + (base.shownAttributeBonus ?? 0))]
  }
  const attributeRows: StatRow[] = [
    shown('strength'),
    shown('dexterity'),
    shown('intelligence'),
    shown('constitution'),
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
    ['Critical damage', `×${stats.critMultiplier.toFixed(2)}`],
    ['Block chance', signed(stats.blockChance ?? 0)],
    ['Stun resistance', percent(stats.stunResistance ?? 0)],
    ['Stone resistance', percent(stats.stoneResistance ?? 0)],
    ['Silence resistance', percent(stats.silenceResistance ?? 0)],
  ]
  const speedRows: StatRow[] = [
    // the speed the hero really runs at: at most MAX_RUN_SPEED (owner's rule)
    ['Run speed', `${runSpeed(stats).toFixed(1)} m/s`, change(runSpeed(stats), runSpeed(base), 1)],
    [
      'Attack interval',
      `${stats.attackInterval.toFixed(2)} s`,
      change(stats.attackInterval, base.attackInterval, 2)
        ? `${change(stats.attackInterval, base.attackInterval, 2)} s`
        : undefined,
    ],
    // what the bonuses still add under the 20 m/s cap, not their uncapped sum
    ['Movement bonus', signed(cappedMoveBonus(stats))],
    [
      'Cast time adjustment',
      `${castTime > 0 ? '+' : castTime < 0 ? '−' : ''}${Math.abs(castTime).toFixed(1)} s`,
    ],
    ['Cast speed', signed(stats.castSpeed ?? 0)],
    [
      'Cooldown adjustment',
      `${(stats.reuseTime ?? 0) > 0 ? '+' : ''}${(stats.reuseTime ?? 0).toFixed(1)} s`,
    ],
    ['Cooldown bonus', stats.cooldownFree ? '100%' : signed(stats.cooldownReduction ?? 0)],
    ['Skill MP cost', signed(-Math.min(100, stats.mpCostReduction ?? 0))],
  ]
  const recoveryRows: StatRow[] = [
    [
      'HP recovery',
      `+${fmt(Math.round(hpRecovery))} / ${REGEN_TICK_SECONDS}s`,
      change(hpRecovery, baseRecovery.hp),
    ],
    [
      'MP recovery',
      `+${fmt(Math.round(mpRecovery))} / ${REGEN_TICK_SECONDS}s`,
      change(mpRecovery, baseRecovery.mp),
    ],
    ['HP steal', signed(stats.hpSteal ?? 0)],
    ['MP steal', signed(stats.mpSteal ?? 0)],
  ]
  // worn options, then the reward boosts working now (scrolls, Iris, pills) on top of them
  const bonuses = rewardBonuses(character)
  const boosted = effectRewardMultipliers(effects)
  const total = (option: number, rate: number) => Math.round(((1 + option / 100) * rate - 1) * 100)
  const bonusRows: [string, number][] = [
    ['EXP', total(bonuses.exp, boosted.exp)],
    ['Skill points', total(bonuses.sp, boosted.sp)],
    ['Gold', total(bonuses.gold, boosted.gold)],
    ['Drop chance', total(bonuses.drop, boosted.drop)],
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
      // taking off or upgrading: what it changed in the hero's stats, under the message
      const before = heroStats(character)
      const message = await action()
      const after = useGameStore.getState().character
      const changes = after ? statChanges(before, heroStats(after)) : []
      toast(withStatChanges(message, changes), 'info', changes.length ? STAT_TOAST_MS : undefined)
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
              disabled={busy || locked}
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
                disabled={busy || locked || stones < 1 || piece.plus >= MAX_PLUS}
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
    <Sheet
      title="Character"
      titleId="character-title"
      className="sheet--fixed sheet--client sheet--character"
      onClose={onClose}
    >
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
              <h3 className="character-stats__heading">
                {name}
                {name === 'Attributes' && (
                  <span
                    className="attribute-points"
                    aria-label={`${points} attribute points available`}
                  >
                    Points: <strong>{fmt(points)}</strong>
                  </span>
                )}
                {name === 'Speed and skills' && (
                  <button
                    type="button"
                    className="stat-help"
                    aria-haspopup="dialog"
                    aria-expanded={speedHelpOpen}
                    onClick={() => setSpeedHelpOpen(true)}
                  >
                    How speeds work
                  </button>
                )}
              </h3>
              <dl className="hero-stats">
                {rows.map(([label, value, buffed], index) => (
                  <div key={label}>
                    <dt>
                      <span>{label}</span>
                      {buffed && <span className="hero-stats__buff">{buffed}</span>}
                    </dt>
                    <dd>{value}</dd>
                    {name === 'Attributes' && (
                      <button
                        type="button"
                        className="attribute-add"
                        aria-label={`Add ${label}`}
                        disabled={busy || away || points < 1}
                        onClick={() =>
                          run(async () => {
                            await allocateStatPoint(ATTRIBUTE_KEYS[index]!)
                            return `${label} increased by 1.`
                          })
                        }
                      >
                        +
                      </button>
                    )}
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
              {boosted.lucky && (
                <div>
                  <dt>Lucky Spell Book</dt>
                  <dd>Drop ×2 20%, gold ×2 80%</dd>
                </div>
              )}
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
          className="equip-tab"
        >
          <div className="equip-frame">
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
          </div>
          <h3 className="character-stats__heading">Worn</h3>
          <ul className="equip-list" aria-label="Worn gear">
            {slots.map((slot) => {
              const piece = character.equipment[slot]
              return (
                <li key={slot}>
                  <button
                    type="button"
                    className={`equip-list__row${selected === slot ? ' is-open' : ''}`}
                    onClick={() => setSelected(selected === slot ? null : slot)}
                  >
                    <span className="equip-list__slot">{SLOT_LABELS[slot]}</span>
                    <span className={`equip-list__name${piece ? nameTone(piece) : ' is-empty'}`}>
                      {piece ? pieceName(piece.itemId, piece.plus, piece.rare) : 'Nothing worn'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {selected && !character.equipment[selected] && (
            <p className="sheet__meta">
              {SLOT_LABELS[selected]}: nothing worn. The Inventory has your gear.
            </p>
          )}
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
          {character.dungeons?.active && (
            <p className="sheet__meta">Equipment is locked for this dungeon run.</p>
          )}
        </div>
      )}
      {speedHelpOpen && <SpeedHelp onClose={() => setSpeedHelpOpen(false)} />}
    </Sheet>
  )
}

/** The movement bonus the hero really runs with: bonuses past MAX_RUN_SPEED do not count. */
function cappedMoveBonus(stats: CombatStats): number {
  const bonus = stats.moveSpeed ?? 0
  const raw = stats.client?.runSpeed
  if (!raw) return bonus
  return Math.round(((runSpeed(stats) / raw) * (1 + bonus / 100) - 1) * 1000) / 10
}
