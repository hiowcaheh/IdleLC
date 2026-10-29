/**
 * TEMPORARY player stats for LC mode. The LC database has no class base stats (they live in the
 * server code), so until they are known (M3) the player is scaled against the LC monsters of the
 * same level: a typical monster dies in ~HITS_TO_KILL blows and hits back for about a third of its
 * attack. Own values, not LC data — see docs/balance.md.
 */
import type { CombatStats } from '../data/types.ts'
import { baseDamage } from './balance.ts'

export const HITS_TO_KILL = 8
const LEVEL_WINDOW = 3
const MONSTER_HITS_TO_KILL_PLAYER = 30

export interface MonsterSample {
  level: number
  hp: number
  attack: number
  defense: number
  elite: boolean
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Normal monsters near `level`; widens the window until something is found. */
function peers(level: number, monsters: MonsterSample[]): MonsterSample[] {
  const normal = monsters.filter((m) => !m.elite)
  const pool = normal.length > 0 ? normal : monsters
  for (let window = LEVEL_WINDOW; window <= 200; window *= 2) {
    const near = pool.filter((m) => Math.abs(m.level - level) <= window)
    if (near.length > 0) return near
  }
  return pool
}

/** Attack needed so that baseDamage(attack, defense) equals `damage`. */
export function attackForDamage(damage: number, defense: number): number {
  return (damage + Math.sqrt(damage * damage + 4 * damage * Math.max(0, defense))) / 2
}

export function lcPlayerStats(
  level: number,
  monsters: MonsterSample[],
  classBase: CombatStats,
): CombatStats {
  if (monsters.length === 0) return classBase
  const near = peers(level, monsters)
  const hp = median(near.map((m) => m.hp))
  const defense = median(near.map((m) => m.defense))
  const attack = median(near.map((m) => m.attack))
  const playerDefense = Math.round(attack * 2)
  const incoming = baseDamage(attack, playerDefense)
  return {
    ...classBase,
    attack: Math.round(attackForDamage(hp / HITS_TO_KILL, defense)),
    defense: playerDefense,
    maxHp: Math.max(100 + level * 60, Math.round(incoming * MONSTER_HITS_TO_KILL_PLAYER)),
  }
}
