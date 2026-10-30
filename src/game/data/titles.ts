import { lcData } from './lcSource.ts'
import type { TitleDef } from './types.ts'

/** Own placeholder titles for the game without the LC data — and the tests. */
const PLACEHOLDER_TITLES: TitleDef[] = [
  {
    id: 1,
    item: 900,
    name: 'Brave Hunter',
    description: 'A title for brave hunters.',
    days: 7,
    color: '#ff8000',
    outline: '#c0c0c0',
    options: [
      { type: 0, level: 2 },
      { type: 20, level: 3 },
    ],
  },
]

/** Titles 1:1 from t_title (scripts/lc/import-db.mjs buildTitles), by id. */
export const TITLES: Record<number, TitleDef> = Object.fromEntries(
  (lcData ? (lcData.titles ?? []) : PLACEHOLDER_TITLES).map((t) => [t.id, t]),
)

export function getTitle(id: number): TitleDef | undefined {
  return TITLES[id]
}
