#!/usr/bin/env node
/** Regenerate only Laca Ball data, original art and the item sheet, preserving other assets. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ClientFiles } from './client.mjs'
import { parseTexture } from './texture.mjs'
import { readTables } from './sql.mjs'
import { buildLacaBallCourses } from './lacaball.mjs'
import { buildIconSheet, ICON_KINDS } from './icons.mjs'
import { eventButton } from './event-button.mjs'

const [dump, client] = process.argv.slice(2)
if (!dump || !client)
  throw new Error('Usage: node scripts/lc/lacaball-assets.mjs <dump.sql> <client>')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const generated = path.join(root, 'src/game/data/generated')
const tables = readTables(fs.readFileSync(dump, 'utf8'), ['t_item', 't_lacarette'])
fs.writeFileSync(
  path.join(generated, 'lc-lacaball.json'),
  JSON.stringify(buildLacaBallCourses(tables.t_lacarette)),
)

const dataFile = path.join(generated, 'lc-data.json')
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
for (const id of [5123, 5124]) {
  const r = tables.t_item.find((r) => Number(r.a_index) === id)
  if (!r) throw new Error(`Missing Laca Ball Token ${id}`)
  const item = {
    id,
    name: r.a_name_usa,
    type: Number(r.a_type_idx),
    subtype: Number(r.a_subtype_idx),
    slot: Number(r.a_wearing),
    level: Number(r.a_level),
    jobFlag: Number(r.a_job_flag),
    flag: Number(r.a_flag),
    price: Number(r.a_price),
    stats: [0, 1, 2, 3, 4].map((n) => Number(r[`a_num_${n}`])),
    icon: {
      atlas: Number(r.a_texture_id),
      row: Number(r.a_texture_row),
      col: Number(r.a_texture_col),
    },
    description: r.a_descr_usa,
  }
  const at = data.items.findIndex((r) => r.id === id)
  if (at >= 0) data.items[at] = item
  else data.items.push(item)
}
fs.writeFileSync(dataFile, JSON.stringify(data))
const files = new ClientFiles([client])
const sheet = await buildIconSheet(
  files,
  data.items,
  ICON_KINDS[0].atlasPath,
  'icons/lc/items.webp',
)
if (!sheet.image) throw new Error('Missing item icons')
fs.writeFileSync(path.join(root, 'public/icons/lc/items.webp'), sheet.image)
const manifestFile = path.join(generated, 'lc-icons.json')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
manifest.items = sheet.sheet
fs.writeFileSync(manifestFile, JSON.stringify(manifest))

const texture = parseTexture(files.read('Data\\Interface\\lacaball.tex'))
const atlas = sharp(texture.rgba, {
  raw: { width: texture.width, height: texture.height, channels: 4 },
})
const crop = (left, top, width, height) => atlas.clone().extract({ left, top, width, height })
const parts = {
  top: [0, 0, 500, 42],
  middle: [0, 42, 500, 36],
  bottom: [0, 78, 500, 22],
  machine: [0, 180, 216, 332],
  balls: [218, 334, 208, 158],
  ball: [450, 384, 48, 48],
  basket: [70, 483, 76, 17],
  start: [434, 436, 38, 38],
  'start-down': [474, 436, 38, 38],
  panel: [205, 105, 91, 71],
  field: [80, 104, 118, 22],
  'course-left': [297, 104, 22, 70],
  'course-right': [321, 104, 22, 70],
  'token-left': [155, 129, 14, 14],
  'token-right': [171, 129, 14, 14],
  'capsule-left': [450, 330, 24, 48],
  'capsule-right': [480, 330, 24, 48],
  'capsule-middle': [450, 111, 8, 40],
  slot: [80, 128, 34, 34],
}
const ui = path.join(root, 'public/ui/lc')
for (const [name, rect] of Object.entries(parts))
  await crop(...rect)
    .webp({ lossless: true })
    .toFile(path.join(ui, `lacaball-${name}.webp`))
const ball = await crop(...parts.ball)
  .png()
  .toBuffer()
fs.writeFileSync(
  path.join(ui, 'menu-lacaball.webp'),
  await eventButton(fs.readFileSync(path.join(ui, 'event-frame.webp')), ball),
)
console.log('Laca Ball: 3 courses, Token icons and original client machine extracted.')
