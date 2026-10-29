import sharp from 'sharp'
const [file, ...regions] = process.argv.slice(2)
const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true })
const W = info.width
const alpha = (x, y) => data[(y * W + x) * 4 + 3]
for (const r of regions) {
  const [x0, y0, x1, y1] = r.split(',').map(Number)
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (alpha(x, y) > 16) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  console.log(r, '->', minX, minY, maxX - minX + 1, maxY - minY + 1)
}
