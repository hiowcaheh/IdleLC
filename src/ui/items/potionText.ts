import type { PotionDef } from '../../game/data/types.ts'
import { HP_POTION_BELOW, MP_POTION_BELOW } from '../../game/logic/combat.ts'

const time = (seconds: number) =>
  seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`
const resource = (potion: PotionDef) =>
  potion.kind === 'hp' || potion.kind === 'hpRegen' ? 'HP' : 'MP'
const percent = (share: number) => `${Math.round(share * 100)}%`

/** Short line for item lists ("+16 HP/s · 15 s"). */
export function potionLine(potion: PotionDef): string {
  return potion.kind === 'hp' || potion.kind === 'mp'
    ? `+${potion.power} ${resource(potion)}/s · ${time(potion.duration)}`
    : `${resource(potion)} recovery +${potion.power} · ${time(potion.duration)}`
}

/** What the potion does and when the hero drinks it. */
export function potionText(potion: PotionDef): string {
  const what = resource(potion)
  switch (potion.kind) {
    case 'hp':
    case 'mp': {
      const below = potion.kind === 'hp' ? HP_POTION_BELOW : MP_POTION_BELOW
      return `Restores ${potion.power} ${what} per second for ${time(potion.duration)} (${potion.power * potion.duration} ${what}). Your hero drinks it in fights below ${percent(below)} ${what}.`
    }
    case 'hpRegen':
    case 'mpRegen':
      return `${what} recovery +${potion.power} for ${time(potion.duration)}. Your hero drinks it in fights when ${what} is not full.`
  }
}
