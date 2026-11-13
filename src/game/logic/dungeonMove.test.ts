import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { createCharacterData } from './character.ts'
import { freshFighter } from './combat.ts'
import { createDungeonRun, dungeonStep, type DungeonRun } from './dungeons.ts'
import { monsterFighter } from './fighters.ts'
import { createRng } from './rng.ts'

const NOW = Date.UTC(2026, 10, 7, 12)
function arena(): DungeonRun {
  const hero = {
    ...createCharacterData({ name: 'Runner', classId: 'healer' }, 'm', NOW),
    level: 30,
  }
  const run = createDungeonRun(hero, 'belfist', 'r', NOW)
  const fighter = freshFighter(monsterFighter('lc-35'))
  fighter.hp = 1e9
  fighter.stats = { ...fighter.stats, maxHp: 1e9 }
  fighter.cooldown = 1e6
  run.wave = 1
  run.enemies = [{ uid: run.nextUid++, monsterId: 'lc-35', x: 3, z: 0, fighter, deadFor: -1 }]
  run.player.stats = { ...run.player.stats, attackRange: 20 }
  return run
}
const steps = (run: DungeonRun, input: { x: number; z: number }, n: number) => {
  const rng = createRng(11)
  let attacks = 0
  for (let i = 0; i < n; i++) {
    const tick = dungeonStep(run, 0.05, input, rng)
    run = tick.run
    attacks += tick.events.filter(
      (e) => (e.event.type === 'attack' || e.event.type === 'cast') && e.event.source === 'player',
    ).length
  }
  return { run, attacks }
}

describe('dungeon hero on the run (owner, 2026-11-07)', () => {
  it('attacks standing and not while it runs', () => {
    expect(steps(arena(), { x: 0, z: 0 }, 100).attacks).toBeGreaterThan(0)
    const running = steps(arena(), { x: 0, z: 1 }, 100)
    expect(running.attacks).toBe(0)
    expect(running.run.enemies[0]!.fighter.hp).toBe(1e9)
    expect(running.run.position.z).toBeGreaterThan(1)
  })

  it('says whether it still runs after the last step, so a stop in a batch shows its swing', () => {
    const ran = steps(arena(), { x: 0, z: 1 }, 10).run
    expect(ran.moving).toBe(true)
    // in one batch of steps: it runs, stops and swings; the batch ends standing
    const stopped = steps(ran, { x: 0, z: 0 }, 30)
    expect(stopped.run.moving).toBe(false)
    expect(stopped.attacks).toBeGreaterThan(0)
  })

  it('drops the swing in progress when it starts to run', () => {
    const standing = steps(arena(), { x: 0, z: 0 }, 2).run
    standing.player.impactIn = 0.3
    const ran = dungeonStep(standing, 0.05, { x: 1, z: 0 }, createRng(3)).run
    expect(ran.player.impactIn).toBeNull()
    expect(ran.player.casting).toBeNull()
  })
})
