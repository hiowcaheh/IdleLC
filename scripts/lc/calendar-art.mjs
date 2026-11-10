#!/usr/bin/env node
/** Original CalendarUi fields and the action 52 calendar shortcut. */
import fs from 'node:fs'
import { ClientFiles } from './client.mjs'
import { buildUiParts } from './ui.mjs'
import { eventButton } from './event-button.mjs'
import { buildIconSheet, ICON_KINDS } from './icons.mjs'

const root = process.argv[2]
if (!root) throw new Error('Usage: node scripts/lc/calendar-art.mjs <client-folder>')
const files = new ClientFiles([root])
const art = await buildUiParts(files)
for (const name of ['calendar-cell', 'calendar-selected', 'calendar-weekday', 'calendar-heading'])
  fs.writeFileSync(`public/ui/lc/${name}.webp`, art[name])
fs.writeFileSync(
  'public/ui/lc/menu-calendar.webp',
  await eventButton(art['event-frame'], art['calendar-mark']),
)
// Only the six own items change artwork; all server items keep their source coordinates.
const dataPath = 'src/game/data/generated/lc-data.json'
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
for (const item of data.items) {
  if (item.id >= 95011 && item.id <= 95016) item.icon = { atlas: 15, row: 1, col: 2 }
}
fs.writeFileSync(dataPath, JSON.stringify(data) + '\n')
const path = 'src/game/data/generated/lc-icons.json'
const icons = JSON.parse(fs.readFileSync(path, 'utf8'))
const built = await buildIconSheet(
  files,
  data.items,
  ICON_KINDS[0].atlasPath,
  'icons/lc/items.webp',
)
if (built.missingAtlases.length) throw new Error(`Missing item atlases: ${built.missingAtlases}`)
if (!built.image) throw new Error('No item atlas was generated')
fs.writeFileSync('public/icons/lc/items.webp', built.image)
fs.writeFileSync(path, JSON.stringify({ ...icons, items: built.sheet }) + '\n')
