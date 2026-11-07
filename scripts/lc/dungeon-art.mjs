#!/usr/bin/env node
/**
 * The Dungeons menu button and dungeon masonry, extracted from the readable 2015 client. No raw
 * source in Git.
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ClientFiles } from './client.mjs'
import { parseTexture } from './texture.mjs'
import { buildUiParts } from './ui.mjs'

/** Side of a menu button image: the 22 px quick-menu cell, upscaled 4× like the other menu icons. */
const BUTTON = 88
/** The quick-menu frame's border in the 22 px cell (and the event button's in its 32 px one). */
const BORDER = 2
/** Top and bottom shade of the well: the quick menu's slate, the event buttons' brown. */
const WELL_TOPUI = [
  [52, 62, 72],
  [18, 24, 29],
]
const WELL_EVENT = [
  [34, 17, 6],
  [87, 73, 53],
]
/** The event button: the client's 32 px notice square (EventBtn0), upscaled 4×. */
const EVENT_BUTTON = 128

/**
 * The quick-menu frame with a dark well inside (top and bottom shade of the client's empty slots)
 * and the world map's dungeon mark in it: a button of the same look as Character, Inventory, ….
 */
async function dungeonButton(
  frameWebp,
  markWebp,
  well = WELL_TOPUI,
  side = BUTTON,
  brightness = well === WELL_EVENT ? 1.5 : 1.15,
) {
  const { data, info } = await sharp(frameWebp).raw().toBuffer({ resolveWithObject: true })
  const size = info.width
  for (let y = BORDER; y < size - BORDER; y++) {
    const t = (y - BORDER) / (size - 2 * BORDER - 1)
    for (let x = BORDER; x < size - BORDER; x++) {
      const i = (y * size + x) * info.channels
      for (let c = 0; c < 3; c++)
        data[i + c] = Math.round(well[0][c] + (well[1][c] - well[0][c]) * t)
      if (info.channels === 4) data[i + 3] = 255
    }
  }
  const BUTTON = side
  const frame = await sharp(data, { raw: info })
    .resize(BUTTON, BUTTON, { kernel: 'mitchell' })
    .sharpen({ sigma: 1.2, m1: 1, m2: 3 })
    .png()
    .toBuffer()
  const inner = BUTTON - 2 * BORDER * (BUTTON / size)
  const mark = await sharp(markWebp)
    .resize({ height: Math.round(inner), fit: 'inside' })
    // a touch brighter: on the map it lies on a light parchment, here in a dark well
    .modulate({ brightness })
    .png()
    .toBuffer()
  const { width = 0, height = 0 } = await sharp(mark).metadata()
  return sharp(frame)
    .composite([
      {
        input: mark,
        left: Math.round((BUTTON - width) / 2),
        top: Math.round((BUTTON - height) / 2),
      },
    ])
    .png()
    .toBuffer()
}

const root = process.argv[2]
if (!root) throw new Error('Usage: node scripts/lc/dungeon-art.mjs <client-folder>')
const files = new ClientFiles([root])
const ui = await buildUiParts(files)
for (const name of [
  'page-left',
  'page-right',
  'trophy',
  'menu-dungeon-loot',
  'slider-track',
  'slider-thumb',
  'cash-hot',
  'cash-items',
  'cash-packages',
  'cash-potions',
  'cash-tag-new',
  'cash-tag-hot',
  'cash-slot',
])
  fs.writeFileSync(`public/ui/lc/${name}.webp`, ui[name])
// the client's event / notice square on the right of the screen (owner's choice, 2026-11-07)
await sharp(await dungeonButton(ui['event-frame'], ui['menu-dungeons'], WELL_EVENT, EVENT_BUTTON))
  .webp({ lossless: true })
  .toFile('public/ui/lc/menu-dungeons.webp')
// the item shop button below it (owner's request, 2026-11-07): the shop's gift-box picture
await sharp(
  await dungeonButton(ui['event-frame'], ui['cash-packages'], WELL_EVENT, EVENT_BUTTON, 1),
)
  .webp({ lossless: true })
  .toFile('public/ui/lc/menu-shop.webp')
/**
 * The part of each D_0n loading picture shown in the Dungeons window, inside its ragged black
 * border and above the publisher's emblem (y 378–405). Belfist and Procyon keep the statues at
 * the bottom of the hall; Procyon's ragged left edge reaches x 53.
 */
const LOADING_CROPS = {
  belfist: { left: 40, top: 18, width: 944, height: 358 },
  procyon: { left: 58, top: 18, width: 908, height: 358 },
  maargadum: { left: 40, top: 16, width: 944, height: 344 },
}
const textures = [
  ['belfist', 'Dungeon1', 'dengen1_tile14', 'd1_tile_wall02_1'],
  ['procyon', 'Dungeon2', 'D2_tile01', 'D2_wall01'],
  ['maargadum', 'Dungeon3', 'tile08_d3', 'pole01_d3'],
]
for (const [id, dir, floor, wall] of textures) {
  const out = path.join('public/dungeons', id)
  fs.mkdirSync(out, { recursive: true })
  const art = parseTexture(
    files.read(`Data\\Interface\\Loading\\D_0${textures.findIndex((d) => d[0] === id) + 1}.tex`),
  )
  await sharp(art.rgba, { raw: { width: art.width, height: art.height, channels: 4 } })
    .extract(LOADING_CROPS[id])
    .webp({ quality: 86 })
    .toFile(path.join(out, 'loading.webp'))
  for (const [name, source] of [
    ['floor', floor],
    ['wall', wall],
  ]) {
    const t = parseTexture(files.read(`Data\\World\\${dir}\\Texture\\${source}.tex`))
    await sharp(t.rgba, { raw: { width: t.width, height: t.height, channels: 4 } })
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toFile(path.join(out, `${name}.webp`))
    console.log(id, name, source, `${t.width}x${t.height}`)
  }
}
