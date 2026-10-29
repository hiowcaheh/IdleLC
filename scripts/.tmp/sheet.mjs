import sharp from 'sharp'
const S = process.argv[2]
const parts = [
  ['MessageBox', 0, 0, 216, 23],
  ['MessageBox', 219, 0, 17, 17],
  ['MessageBox', 236, 0, 17, 17],
  ['MessageBox', 0, 116, 131, 21],
  ['MessageBox', 0, 46, 63, 21],
  ['NewInventory', 39, 218, 34, 34],
]
const tiles = []
let y = 0
for (const [atlas, x, yy, w, h] of parts) {
  const src = atlas === 'TopUI' ? `${S}/ui/${atlas}.png` : `${S}/ui2/${atlas}.png`
  const buf = await sharp(src).extract({ left: x, top: yy, width: w, height: h }).resize(w * 3, h * 3, { kernel: 'nearest' }).png().toBuffer()
  tiles.push({ input: buf, left: 0, top: y })
  y += h * 3 + 6
}
await sharp({ create: { width: 660, height: y, channels: 4, background: '#4a6' } }).composite(tiles).png().toFile(`${S}/ui2/parts.png`)
console.log('ok')
