#!/usr/bin/env node
/** Original Q and dungeon masonry, extracted from the readable 2015 client. No raw source in Git. */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ClientFiles } from './client.mjs'
import { parseTexture } from './texture.mjs'
import { buildUiParts } from './ui.mjs'

const root = process.argv[2]
if (!root) throw new Error('Usage: node scripts/lc/dungeon-art.mjs <client-folder>')
const files = new ClientFiles([root])
const ui = await buildUiParts(files)
fs.writeFileSync('public/ui/lc/menu-dungeons.webp', ui['menu-dungeons'])
const textures = [
  ['belfist', 'Dungeon1', 'dengen1_tile14', 'd1_tile_wall02_1'],
  ['procyon', 'Dungeon2', 'D2_tile01', 'D2_wall01'],
  ['maargadum', 'Dungeon3', 'tile08_d3', 'pole01_d3'],
]
for (const [id, dir, floor, wall] of textures) {
  const out = path.join('public/dungeons', id)
  fs.mkdirSync(out, { recursive: true })
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
