import { describe, expect, it } from 'vitest'
import { ZONES } from '../data/zones.ts'
import { createCharacterData } from './character.ts'
import { farthestSpot, isSpotOpen, openSpotCount, recordKills, zoneSpots } from './spots.ts'

// placeholder data: the glade's spots are rust-golem, then stone-sentinel
const hero = createCharacterData({ name: 'Brom', classId: 'knight' }, 'a', 0)
const at = (monsterId: string) => ({ zoneId: 'glade', monsterId })

describe('hunting spots', () => {
  it('starts every zone at its first spot only', () => {
    expect(zoneSpots('glade')).toEqual(['rust-golem', 'stone-sentinel'])
    expect(openSpotCount(hero, 'glade')).toBe(1)
    expect(isSpotOpen(hero, at('rust-golem'))).toBe(true)
    expect(isSpotOpen(hero, at('stone-sentinel'))).toBe(false)
    expect(isSpotOpen(hero, at('dragon'))).toBe(false)
    expect(farthestSpot(hero, 'glade')).toBe('rust-golem')
  })

  it('opens the next spot with a kill at the farthest open one', () => {
    const none = recordKills(hero, at('rust-golem'), 0, 1)
    expect(none.reachedSpots).toEqual({})
    expect(none.stats).toMatchObject({ kills: 0, deaths: 1, monsterKills: {} })
    const next = recordKills(hero, at('rust-golem'), 2, 0)
    expect(next.reachedSpots).toEqual({ glade: 'stone-sentinel' })
    expect(next.stats.monsterKills).toEqual({ 'rust-golem': 2 })
    const opened = { ...hero, ...next }
    expect(isSpotOpen(opened, at('stone-sentinel'))).toBe(true)
    expect(farthestSpot(opened, 'glade')).toBe('stone-sentinel')
    // the last spot opens nothing more; kills keep adding up in the book
    const last = recordKills(opened, at('stone-sentinel'), 3, 0)
    expect(last.reachedSpots).toEqual({ glade: 'stone-sentinel' })
    expect(last.stats.monsterKills).toEqual({ 'rust-golem': 2, 'stone-sentinel': 3 })
  })

  it('keeps raid bosses and event monsters out of the spots', () => {
    for (const zone of Object.values(ZONES)) expect(zone.bossIds).toEqual([])
  })
})
