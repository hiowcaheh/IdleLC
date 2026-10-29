import { describe, expect, it } from 'vitest'
import { DEFAULT_ZONE_ID } from '../data/zones.ts'
import {
  MAX_CHARACTERS,
  checkName,
  checkNewCharacter,
  createCharacterData,
  type CharacterData,
} from './character.ts'

const existing = [createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0)]

describe('character rules', () => {
  it('accepts 3–16 letters or digits starting with a letter', () => {
    expect(checkName('Ann', [])).toBeNull()
    expect(checkName('Knight2008', [])).toBeNull()
    expect(checkName('  Ann  ', [])).toBeNull()
    expect(checkName('Al', [])).toBe('name-length')
    expect(checkName('A'.repeat(17), [])).toBe('name-length')
    expect(checkName('2Fast', [])).toBe('name-characters')
    expect(checkName('Dark Lord', [])).toBe('name-characters')
    expect(checkName('Zoë', [])).toBe('name-characters')
  })

  it('rejects names already used on the account, ignoring case', () => {
    expect(checkName('BROM', existing)).toBe('name-taken')
  })

  it('checks the class and the free slots', () => {
    expect(checkNewCharacter({ name: 'Cora', classId: 'mage' }, existing)).toBeNull()
    expect(checkNewCharacter({ name: 'Cora', classId: 'necromancer' as never }, existing)).toBe(
      'unknown-class',
    )
    const full: CharacterData[] = Array.from({ length: MAX_CHARACTERS }, (_, i) =>
      createCharacterData({ name: `Hero${i}`, classId: 'titan' }, String(i), 0),
    )
    expect(checkNewCharacter({ name: 'Cora', classId: 'mage' }, full)).toBe('no-free-slot')
  })

  it('creates a level 1 character in the starting zone', () => {
    const c = createCharacterData({ name: ' Cora ', classId: 'sorcerer' }, 'id', 123)
    expect(c).toMatchObject({
      id: 'id',
      name: 'Cora',
      classId: 'sorcerer',
      level: 1,
      exp: 0,
      gold: 0,
      createdAt: 123,
      stats: { kills: 0, deaths: 0 },
    })
    expect(c.location.zoneId).toBe(DEFAULT_ZONE_ID)
  })
})
