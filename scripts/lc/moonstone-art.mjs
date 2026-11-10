#!/usr/bin/env node
/** Extract only the statue's original CUIGamble art; leave every existing UI asset untouched. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClientFiles } from './client.mjs'
import { buildUiParts } from './ui.mjs'
import { eventButton } from './event-button.mjs'

const client = process.argv[2]
if (!client) throw new Error('Usage: node scripts/lc/moonstone-art.mjs <client folder>')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const art = await buildUiParts(new ClientFiles([client]))
for (const [name, buffer] of Object.entries(art)) {
  if (name === 'moonstone-mark') continue
  if (!name.startsWith('moonstone-') && name !== 'event-frame') continue
  fs.writeFileSync(path.join(root, 'public/ui/lc', `${name}.webp`), buffer)
  console.log(name)
}

// The statue's own face in the same single event frame as the other shortcuts.
fs.writeFileSync(
  path.join(root, 'public/ui/lc/menu-moonstone.webp'),
  await eventButton(art['event-frame'], art['moonstone-mark'], 1.2),
)
