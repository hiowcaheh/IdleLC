#!/usr/bin/env node
/**
 * The whole Laca Ball window texture (Data/Interface/lacaball.tex, 512×512) as one lossless WebP.
 * The window (src/ui/lacaball/) draws every piece from it at the UV rectangles of the client's
 * CUILacaball (UILacarette.cpp), so no piece has to be cut by hand. No raw source in Git.
 *
 *   node scripts/lc/lacaball-gui.mjs "<readable 2015 client>"
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { ClientFiles } from './client.mjs'
import { parseTexture } from './texture.mjs'

const [client] = process.argv.slice(2)
if (!client) throw new Error('Usage: node scripts/lc/lacaball-gui.mjs <client>')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const texture = parseTexture(new ClientFiles([client]).read('Data\\Interface\\lacaball.tex'))
if (texture.width !== 512 || texture.height !== 512)
  throw new Error(`lacaball.tex is ${texture.width}×${texture.height}, expected 512×512`)
const out = path.join(root, 'public/ui/lc/lacaball-atlas.webp')
await sharp(texture.rgba, { raw: { width: 512, height: 512, channels: 4 } })
  .webp({ lossless: true, effort: 6 })
  .toFile(out)
console.log(`Laca Ball window texture: ${out}`)
