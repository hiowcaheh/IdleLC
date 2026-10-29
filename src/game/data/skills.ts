import { iconSprite, type IconSprite } from './icons.ts'
import { lcData, lcIcons } from './lcSource.ts'
import type { ClassId, SkillDef } from './types.ts'

/** Own placeholder skills (one of each kind) for the game without the LC data — and the tests. */
const PLACEHOLDER_SKILLS: SkillDef[] = [
  {
    id: 1,
    classId: 'knight',
    name: 'Power Strike',
    description: 'A heavy blow that deals extra damage.',
    type: 0,
    targetType: 2,
    readyTime: 0,
    fireTime: 10,
    reuseTime: 40,
    levels: [1, 2, 3].map((level) => ({
      level,
      mp: 4 + level,
      hp: 0,
      duration: 0,
      learnLevel: level * 2 - 1,
      learnSp: level - 1,
      requires: [],
      effects: [{ type: 3, subtype: 0, damageType: 1, power: 130 + level * 30 }],
    })),
  },
  {
    id: 2,
    classId: 'knight',
    name: 'Iron Skin',
    description: 'Increases defense for a while.',
    type: 2,
    targetType: 0,
    readyTime: 0,
    fireTime: 8,
    reuseTime: 20,
    levels: [1, 2].map((level) => ({
      level,
      mp: 10,
      hp: 0,
      duration: 600,
      learnLevel: 2,
      learnSp: level,
      requires: [{ skill: 1, level: 1 }],
      effects: [{ type: 0, subtype: 1, damageType: 1, power: 4 * level }],
    })),
  },
  {
    id: 3,
    classId: 'knight',
    name: 'Toughness',
    description: 'Increases maximum health.',
    type: 3,
    targetType: 0,
    readyTime: 0,
    fireTime: 0,
    reuseTime: 0,
    levels: [1, 2].map((level) => ({
      level,
      mp: 0,
      hp: 0,
      duration: 0,
      learnLevel: 3,
      learnSp: 1,
      requires: [],
      effects: [{ type: 0, subtype: 12, damageType: 1, power: 20 * level }],
    })),
  },
]

const SKILL_LIST: SkillDef[] = lcData?.skills
  ? lcData.skills.map(({ icon: _icon, ...s }) => ({
      ...s,
      classId: s.classId as ClassId,
      levels: s.levels.map((l) => ({ ...l, effects: l.effects.map(({ magic: _m, ...e }) => e) })),
    }))
  : PLACEHOLDER_SKILLS

export const SKILLS: Record<number, SkillDef> = Object.fromEntries(SKILL_LIST.map((s) => [s.id, s]))

/** A class's skills in learning order (by the level the first rank needs). */
export function skillsForClass(classId: ClassId): SkillDef[] {
  return SKILL_LIST.filter((s) => s.classId === classId)
}

export function getSkill(id: number): SkillDef | undefined {
  return SKILLS[id]
}

export function skillIcon(id: number): IconSprite | null {
  return iconSprite(lcIcons?.skills, id)
}
