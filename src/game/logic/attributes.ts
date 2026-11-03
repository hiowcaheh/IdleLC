/** Unpromoted class attributes and resource coefficients: GameServer/PC.cpp:58–138. */
import type { ClassId } from '../data/types.ts'

export const ATTRIBUTE_KEYS = ['strength', 'dexterity', 'intelligence', 'constitution'] as const
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number]
export type Attributes = Record<AttributeKey, number>

type Row = readonly [number, number, number, number]
const BASE: Record<ClassId, Row> = {
  titan: [50, 20, 20, 50],
  knight: [38, 28, 28, 38],
  healer: [20, 50, 38, 28],
  mage: [20, 50, 50, 20],
  rogue: [38, 50, 20, 28],
  sorcerer: [20, 44, 44, 28],
}
export const ATTRIBUTE_GROWTH: Record<ClassId, Row> = {
  titan: [3, 1, 1, 3],
  knight: [2, 2, 2, 2],
  healer: [1, 3, 2, 2],
  mage: [1, 3, 3, 1],
  rogue: [3, 3, 1, 1],
  sorcerer: [1, 2, 3, 2],
}
export const HP_COEFFICIENT: Record<ClassId, Row> = {
  titan: [4, 0, 0, 8],
  knight: [4, 0, 0, 11],
  healer: [4, 0, 0, 7],
  mage: [3, 0, 0, 8],
  rogue: [5, 0, 0, 12],
  sorcerer: [5, 0, 0, 5],
}
export const MP_COEFFICIENT: Record<ClassId, Row> = {
  titan: [0, 0, 8, 2],
  knight: [0, 0, 6, 2],
  healer: [0, 0, 9, 2],
  mage: [0, 0, 10, 1],
  rogue: [0, 0, 7, 2],
  sorcerer: [0, 0, 7, 4],
}
const RESOURCES: Record<ClassId, readonly [number, number]> = {
  titan: [180, 68],
  knight: [150, 86],
  healer: [110, 108],
  mage: [90, 122],
  rogue: [130, 56],
  sorcerer: [110, 128],
}

export function classAttributes(classId: ClassId, level: number): Attributes {
  const growth = Math.max(0, Math.floor(level) - 1)
  return Object.fromEntries(
    ATTRIBUTE_KEYS.map((key, i) => [
      key,
      BASE[classId][i]! + growth * ATTRIBUTE_GROWTH[classId][i]!,
    ]),
  ) as Attributes
}

/** Source m_dbHP/MP, used as option percentage bases; primary combat HP remains the idle adapter. */
export function classResources(classId: ClassId, level: number): { maxHp: number; maxMp: number } {
  const growth = Math.max(0, Math.floor(level) - 1)
  const resource = (coefficients: Row, base: number) =>
    base +
    growth * ATTRIBUTE_GROWTH[classId].reduce((sum, value, i) => sum + value * coefficients[i]!, 0)
  return {
    maxHp: resource(HP_COEFFICIENT[classId], RESOURCES[classId][0]),
    maxMp: resource(MP_COEFFICIENT[classId], RESOURCES[classId][1]),
  }
}
