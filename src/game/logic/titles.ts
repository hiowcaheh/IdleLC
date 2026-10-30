/**
 * Titles (t_title): a title item (type Other) used from the bag adds its title to the character for
 * the title's days (or for good); the worn title shows under the hero's name and its options count
 * like gear options. Pure — the server runs the same rules.
 */
import { getItem } from '../data/items.ts'
import { getTitle } from '../data/titles.ts'
import type { TitleDef } from '../data/types.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { takeFromInventory } from './loot.ts'
import type { ItemOption } from './options.ts'

export const DAY_MS = 24 * 3600 * 1000

/** A title the character has: until when (ms since epoch), null = permanent. */
export interface OwnedTitle {
  id: number
  expiresAt: number | null
}

type Titled = Pick<CharacterData, 'titles' | 'activeTitle'>

const live = (title: OwnedTitle, now: number) => title.expiresAt === null || title.expiresAt > now

/** The character without its run-out titles (the worn one comes off when it runs out). */
export function pruneTitles<C extends Titled>(character: C, now: number): C {
  const titles = character.titles.filter((t) => live(t, now))
  if (titles.length === character.titles.length) return character
  const worn = titles.some((t) => t.id === character.activeTitle)
  return { ...character, titles, activeTitle: worn ? character.activeTitle : null }
}

/** The worn title, if the character still has it. */
export function wornTitle(character: Titled, now?: number): TitleDef | undefined {
  const id = character.activeTitle
  if (id === null) return undefined
  const owned = character.titles.find((t) => t.id === id)
  if (!owned || (now !== undefined && !live(owned, now))) return undefined
  return getTitle(id)
}

/** Options of the worn title (counted like gear options). */
export function titleOptions(activeTitle: number | null | undefined): ItemOption[] {
  return activeTitle === null || activeTitle === undefined
    ? []
    : (getTitle(activeTitle)?.options ?? [])
}

/** Titles the game gives by itself (t_title ids): "Newbie" to a new character for 7 days. */
export const NEWBIE_TITLE = 23
/** "Rising Star" when the character reaches level 50 (more milestones later: rankings…). */
export const LEVEL_TITLES: readonly { level: number; titleId: number }[] = [
  { level: 50, titleId: 22 },
]

/**
 * Adds a title for its days (an owned one gets its days added on top; a permanent one stays), worn
 * when no other title is. Titles missing from the data are skipped.
 */
export function grantTitle<C extends Titled>(character: C, titleId: number, now: number): C {
  const title = getTitle(titleId)
  if (!title) return character
  const owned = character.titles.find((t) => t.id === titleId)
  if (owned && owned.expiresAt === null) return character
  const expiresAt =
    title.days === null ? null : Math.max(owned?.expiresAt ?? now, now) + title.days * DAY_MS
  return {
    ...character,
    titles: [...character.titles.filter((t) => t.id !== titleId), { id: titleId, expiresAt }],
    activeTitle: character.activeTitle ?? titleId,
  }
}

/**
 * Titles for levels reached (each given once: `titlesEarned` keeps them from coming back after
 * they run out).
 */
export function applyLevelTitles(character: CharacterData, now: number): CharacterData {
  let next = character
  for (const { level, titleId } of LEVEL_TITLES) {
    if (character.level < level || next.titlesEarned.includes(titleId) || !getTitle(titleId)) {
      continue
    }
    next = grantTitle({ ...next, titlesEarned: [...next.titlesEarned, titleId] }, titleId, now)
  }
  return next
}

export interface TitleUse {
  character: CharacterData
  title: TitleDef
  /** The title was owned already: its time was extended. */
  extended: boolean
}

/**
 * Uses a title item from the bag: the title is added for its days (an owned one gets its days added
 * on top), and worn when no other title is. A permanent title can't be added twice.
 */
export function applyUseTitleItem(character: CharacterData, itemId: number, now: number): TitleUse {
  const titleId = getItem(itemId).title
  const title = titleId === undefined ? undefined : getTitle(titleId)
  if (!title) throw new GameError('not-a-title', `item ${itemId}`)
  const current = pruneTitles(character, now)
  const owned = current.titles.find((t) => t.id === title.id)
  if (owned && owned.expiresAt === null) throw new GameError('title-owned', `title ${title.id}`)
  const { inventory, taken } = takeFromInventory(current.inventory, [{ itemId, count: 1 }])
  if (taken.length === 0) throw new GameError('no-item', `item ${itemId}`)
  return {
    character: grantTitle({ ...current, inventory }, title.id, now),
    title,
    extended: owned !== undefined,
  }
}

/** Wears an owned title (null: takes the worn one off). */
export function applyWearTitle<C extends Titled>(
  character: C,
  titleId: number | null,
  now: number,
): C {
  const current = pruneTitles(character, now)
  if (titleId !== null && !current.titles.some((t) => t.id === titleId)) {
    throw new GameError('no-title', `title ${titleId}`)
  }
  return { ...current, activeTitle: titleId }
}
