import { describe, expect, it } from 'vitest'
import { dungeonSession } from '../game/session/dungeonSession.ts'
import { useGameStore } from './gameStore.ts'

describe('dungeon lifecycle in the game store', () => {
  it('clears a finished result when switching characters', async () => {
    await useGameStore.getState().init()
    await useGameStore.getState().resetSave()
    const a = await useGameStore.getState().createCharacter({ name: 'DungeonA', classId: 'knight' })
    await useGameStore.getState().enterGame(a.id)
    await useGameStore.getState().startDungeon('belfist')
    await useGameStore.getState().finishDungeon()
    expect(useGameStore.getState().dungeonResult).not.toBeNull()
    await useGameStore.getState().leaveGame()
    const b = await useGameStore.getState().createCharacter({ name: 'DungeonB', classId: 'mage' })
    await useGameStore.getState().enterGame(b.id)
    expect(useGameStore.getState().dungeon).toBeNull()
    expect(useGameStore.getState().dungeonResult).toBeNull()
    expect(dungeonSession.state).toBeNull()
    expect(useGameStore.getState().character?.id).toBe(b.id)
  })

  it('clears a live dungeon on save reset so a new character can enter a fresh run', async () => {
    await useGameStore.getState().resetSave()
    const a = await useGameStore
      .getState()
      .createCharacter({ name: 'BeforeReset', classId: 'knight' })
    await useGameStore.getState().enterGame(a.id)
    await useGameStore.getState().startDungeon('belfist')
    const previous = useGameStore.getState().dungeon!.id
    await useGameStore.getState().resetSave()
    expect(useGameStore.getState().dungeon).toBeNull()
    expect(dungeonSession.state).toBeNull()
    const b = await useGameStore
      .getState()
      .createCharacter({ name: 'AfterReset', classId: 'healer' })
    await useGameStore.getState().enterGame(b.id)
    await useGameStore.getState().startDungeon('belfist')
    const state = useGameStore.getState()
    expect(state.dungeon!.id).not.toBe(previous)
    expect(state.dungeon).toMatchObject({ level: 1, xp: 0, score: 0, buffs: [] })
    expect(state.character!.dungeons!.entries.belfist).toBe(1)
    await state.finishDungeon()
    await useGameStore.getState().leaveGame()
  })
})
