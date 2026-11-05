import type { ReactNode } from 'react'
import type { ClientCombatStats, CombatStats } from '../game/data/types.ts'

/** One stat that changed: its name, the change as the Character window shows it, better or worse. */
export interface StatChange {
  label: string
  text: string
  good: boolean
}

interface Metric {
  label: string
  value(stats: CombatStats): number | undefined
  digits?: number
  unit?: string
  /** A smaller value is better (attack interval). */
  lowerIsBetter?: boolean
}

const client =
  (key: keyof ClientCombatStats) =>
  (s: CombatStats): number | undefined =>
    s.client?.[key]

/** The stats of the Character window, in its order. */
const METRICS: Metric[] = [
  { label: 'Strength', value: (s) => s.strength },
  { label: 'Dexterity', value: (s) => s.dexterity },
  { label: 'Intelligence', value: (s) => s.intelligence },
  { label: 'Constitution', value: (s) => s.constitution },
  { label: 'Health', value: (s) => s.maxHp },
  { label: 'Mana', value: (s) => s.maxMp },
  { label: 'Physical attack', value: client('physicalAttack') },
  { label: 'Magic attack', value: client('magicAttack') },
  { label: 'Physical defense', value: client('physicalDefense') },
  { label: 'Magic defense', value: client('magicDefense') },
  { label: 'Physical hit rate', value: client('physicalHit') },
  { label: 'Magic hit rate', value: client('magicHit') },
  { label: 'Physical evasion', value: client('physicalEvasion') },
  { label: 'Magic evasion', value: client('magicEvasion') },
  { label: 'Critical rating', value: client('criticalRating') },
  { label: 'Deadly rating', value: client('deadlyRating') },
  { label: 'Critical damage', value: (s) => s.critMultiplier * 100, unit: '%' },
  { label: 'Attack range', value: (s) => s.attackRange, digits: 1, unit: ' m' },
  { label: 'Run speed', value: client('runSpeed'), digits: 1, unit: ' m/s' },
  {
    label: 'Attack interval',
    value: (s) => s.attackInterval,
    digits: 2,
    unit: ' s',
    lowerIsBetter: true,
  },
  { label: 'Cast speed', value: (s) => s.castSpeed, unit: '%' },
  { label: 'Cooldown bonus', value: (s) => s.cooldownReduction, unit: '%' },
  { label: 'Skill MP saved', value: (s) => s.mpCostReduction, unit: '%' },
  { label: 'Block chance', value: (s) => s.blockChance, unit: '%' },
  { label: 'Stun resistance', value: (s) => s.stunResistance, unit: '%' },
  { label: 'Stone resistance', value: (s) => s.stoneResistance, unit: '%' },
  { label: 'Silence resistance', value: (s) => s.silenceResistance, unit: '%' },
  { label: 'HP steal', value: (s) => s.hpSteal, unit: '%' },
  { label: 'MP steal', value: (s) => s.mpSteal, unit: '%' },
]

/** What changed between two sets of the hero's stats, as the Character window rounds them. */
export function statChanges(before: CombatStats, after: CombatStats): StatChange[] {
  const changes: StatChange[] = []
  for (const m of METRICS) {
    const digits = m.digits ?? 0
    const a = Number((m.value(before) ?? 0).toFixed(digits))
    const b = Number((m.value(after) ?? 0).toFixed(digits))
    const d = Number((b - a).toFixed(digits))
    if (d === 0) continue
    const amount = Math.abs(d).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    changes.push({
      label: m.label,
      text: `${d > 0 ? '+' : '−'}${amount}${m.unit ?? ''}`,
      good: m.lowerIsBetter ? d < 0 : d > 0,
    })
  }
  return changes
}

/** Shown at most in one message; the rest is counted. */
const MAX_LINES = 6

/**
 * A window's message with what it changed in the hero's stats below it: better in green, worse in
 * red (the toasts of equipping, upgrading, titles and potions).
 */
export function withStatChanges(message: string, changes: readonly StatChange[]): ReactNode {
  if (changes.length === 0) return message
  const shown = changes.slice(0, MAX_LINES)
  return (
    <span className="stat-toast">
      <span className="stat-toast__message">{message}</span>
      <span className="stat-toast__changes">
        {shown.map((c) => (
          <span key={c.label} className={`stat-toast__change ${c.good ? 'is-up' : 'is-down'}`}>
            {c.label} <strong>{c.text}</strong>
          </span>
        ))}
        {changes.length > shown.length && (
          <span className="stat-toast__more">and {changes.length - shown.length} more</span>
        )}
      </span>
    </span>
  )
}
