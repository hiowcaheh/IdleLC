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
/** The quick-menu frame's border in the 22 px cell. */
const BORDER = 2

/**
 * The quick-menu frame with a dark well inside (top and bottom shade of the client's empty slots)
 * and the world map's dungeon mark in it: a button of the same look as Character, Inventory, ….
 */
async function dungeonButton(frameWebp, markWebp) {
  const { data, info } = await sharp(frameWebp).raw().toBuffer({ resolveWithObject: true })
  const size = info.width
  for (let y = BORDER; y < size - BORDER; y++) {
    const t = (y - BORDER) / (size - 2 * BORDER - 1)
    for (let x = BORDER; x < size - BORDER; x++) {
      const i = (y * size + x) * info.channels
      data[i] = Math.round(52 + (18 - 52) * t)
      data[i + 1] = Math.round(62 + (24 - 62) * t)
      data[i + 2] = Math.round(72 + (29 - 72) * t)
      if (info.channels === 4) data[i + 3] = 255
    }
  }
  const frame = await sharp(data, { raw: info })
    .resize(BUTTON, BUTTON, { kernel: 'mitchell' })
    .sharpen({ sigma: 1.2, m1: 1, m2: 3 })
    .png()
    .toBuffer()
  const inner = BUTTON - 2 * BORDER * (BUTTON / size)
  const mark = await sharp(markWebp)
    .resize({ height: Math.round(inner), fit: 'inside' })
    // a touch brighter: on the map it lies on a light parchment, here in a dark well
    .modulate({ brightness: 1.15 })
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
for (const name of ['page-left', 'page-right'])
  fs.writeFileSync(`public/ui/lc/${name}.webp`, ui[name])
await sharp(await dungeonButton(ui['menu-frame'], ui['menu-dungeons']))
  .webp({ lossless: true })
  .toFile('public/ui/lc/menu-dungeons.webp')
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
    .extract({ left: 40, top: 16, width: 944, height: 344 })
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
