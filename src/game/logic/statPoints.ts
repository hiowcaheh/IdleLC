import { ATTRIBUTE_KEYS, type Attributes, type AttributeKey } from './attributes.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'

export const EMPTY_ALLOCATED_STATS: Attributes = {
  strength: 0,
  dexterity: 0,
  intelligence: 0,
  constitution: 0,
}

/** PC.cpp:1370–1379: unpromoted characters gain one distributable point per level up. */
export function earnedStatPoints(level: number): number {
  return Math.max(0, Math.floor(level) - 1)
}

export function sanitizeAllocatedStats(raw: unknown, level: number): Attributes {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  let left = earnedStatPoints(level)
  const result = { ...EMPTY_ALLOCATED_STATS }
  for (const key of ATTRIBUTE_KEYS) {
    const value = input[key]
    result[key] = Math.min(
      left,
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0,
    )
    left -= result[key]
  }
  return result
}

export function availableStatPoints(
  character: Pick<CharacterData, 'level' | 'allocatedStats'>,
): number {
  return (
    earnedStatPoints(character.level) -
    ATTRIBUTE_KEYS.reduce((sum, key) => sum + character.allocatedStats[key], 0)
  )
}

/** PC.cpp:2811–2853: consume exactly one remaining point, then recalculate the character. */
export function allocateStatPoint(
  character: CharacterData,
  attribute: AttributeKey,
): CharacterData {
  if (!ATTRIBUTE_KEYS.includes(attribute)) throw new GameError('unknown-attribute', attribute)
  if (availableStatPoints(character) < 1)
    throw new GameError('no-stat-points', 'No attribute points remain')
  return {
    ...character,
    allocatedStats: {
      ...character.allocatedStats,
      [attribute]: character.allocatedStats[attribute] + 1,
    },
  }
}
