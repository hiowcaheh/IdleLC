import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { parseTexture } from '../lc/texture.mjs'
const [out, ...files] = process.argv.slice(2)
for (const f of files) {
  const name = path.basename(f, '.tex')
  const buf = fs.readFileSync(f)
  try {
    const t = parseTexture(buf)
    await sharp(Buffer.from(t.rgba), { raw: { width: t.width, height: t.height, channels: 4 } }).png().toFile(path.join(out, name + '.png'))
    console.log(name, t.width, t.height, t.format)
  } catch (e) {
    console.log(name, 'ERR', e.message, buf.length, buf.subarray(0, 24).toString('latin1').replace(/[^\x20-\x7e]/g, '.'))
  }
}
