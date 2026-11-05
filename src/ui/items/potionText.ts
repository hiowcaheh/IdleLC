import type { PotionDef } from '../../game/data/types.ts'
import { HP_POTION_BELOW, MP_POTION_BELOW } from '../../game/logic/combat.ts'
import { interpretEffect, type StatEffect } from '../../game/logic/skills.ts'
import { statLine, statParts } from '../skills/format.ts'

const time = (seconds: number) =>
  seconds >= 60 && seconds % 60 === 0
    ? `${seconds / 60} min`
    : seconds > 60
      ? `${Math.floor(seconds / 60)} min ${seconds % 60} s`
      : `${seconds} s`

/** A boost potion's stat changes ("Attack speed +15%, Run speed +1.5 m/s"). */
function boostStats(potion: PotionDef): string {
  return (potion.effects ?? [])
    .flatMap((e) => {
      const effect = interpretEffect(e)
      return effect?.kind === 'stat' ? [statLine(effect as StatEffect)] : []
    })
    .join(', ')
}
const resource = (potion: PotionDef) =>
  potion.kind === 'hp' || potion.kind === 'hpRegen' ? 'HP' : 'MP'
const percent = (share: number) => `${Math.round(share * 100)}%`

/** Short line for item lists ("+16 HP/s · 15 s"). */
export function potionLine(potion: PotionDef): string {
  if (potion.kind === 'boost') return `${boostStats(potion)} · ${time(potion.duration)}`
  return potion.kind === 'hp' || potion.kind === 'mp'
    ? `+${potion.power} ${resource(potion)}/s · ${time(potion.duration)}`
    : `${resource(potion)} recovery +${potion.power} · ${time(potion.duration)}`
}

/** What the potion does, one effect per row, then how long it lasts: [label, value]. */
export function potionRows(potion: PotionDef): [string, string][] {
  const what = resource(potion)
  const rows: [string, string][] =
    potion.kind === 'boost'
      ? (potion.effects ?? []).flatMap((e) => {
          const effect = interpretEffect(e)
          return effect?.kind === 'stat' ? [statParts(effect as StatEffect)] : []
        })
      : potion.kind === 'hp' || potion.kind === 'mp'
        ? [
            [`${what} per second`, `+${potion.power}`],
            [`${what} in all`, `+${potion.power * potion.duration}`],
          ]
        : [[`${what} recovery`, `+${potion.power}`]]
  return [...rows, ['Lasts', time(potion.duration)]]
}

/** When the hero drinks it and what happens to it, one sentence per line. */
export function potionNotes(potion: PotionDef): string[] {
  const what = resource(potion)
  switch (potion.kind) {
    case 'hp':
    case 'mp': {
      const below = potion.kind === 'hp' ? HP_POTION_BELOW : MP_POTION_BELOW
      return [`Your hero drinks it in fights below ${percent(below)} ${what}.`]
    }
    case 'hpRegen':
    case 'mpRegen':
      return [`Your hero drinks it in fights when ${what} is not full.`]
    case 'boost':
      return [
        'Drink it from the bag.',
        potion.keepOnDeath ? 'It stays when your hero dies.' : 'It ends when your hero dies.',
        potion.realTime
          ? 'Its time runs by the clock, also while the game is closed.'
          : 'Its time runs while you play and on expeditions.',
        ...(potion.exclusive ? ['Only one at a time.'] : []),
      ]
  }
}
