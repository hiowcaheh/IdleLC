import { getItem } from '../../game/data/items.ts'
import { effectiveStats } from '../../game/logic/combat.ts'
import { GameError } from '../../game/logic/errors.ts'
import { combatSession } from '../../game/session/combatSession.ts'
import { dungeonSession } from '../../game/session/dungeonSession.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { STAT_TOAST_MS, toast } from '../../state/toasts.ts'
import { statChanges, withStatChanges } from '../statChanges.tsx'
import { DRINK_PROBLEMS, potionLine } from './potionText.ts'

/** The hero as it fights now: in a dungeon run, else on the field. */
const heroNow = () => effectiveStats((dungeonSession.combat() ?? combatSession.state).player)

/**
 * Drinks a potion by hand and says what it did, the same on the field and in a dungeon: the stats
 * a boost (Adrenaline, Haste…) changes in green and red, or what a healing potion restores over
 * time. True when it was drunk.
 */
export async function drinkWithToast(itemId: number): Promise<boolean> {
  const item = getItem(itemId)
  try {
    const before = heroNow()
    const problem = await useGameStore.getState().drinkPotion(itemId)
    if (problem) {
      toast(DRINK_PROBLEMS[problem], 'error')
      return false
    }
    const changes =
      item.potion?.kind === 'boost'
        ? statChanges(before, heroNow())
        : item.potion
          ? [{ label: '', text: potionLine(item.potion), good: true }]
          : []
    toast(
      withStatChanges(`You drink ${item.name}.`, changes),
      'info',
      changes.length ? STAT_TOAST_MS : undefined,
    )
    return true
  } catch (e) {
    const code = e instanceof GameError ? e.code : ''
    toast(
      DRINK_PROBLEMS[code as keyof typeof DRINK_PROBLEMS] ??
        (e instanceof Error ? e.message : 'This potion cannot be used right now.'),
      'error',
    )
    return false
  }
}
