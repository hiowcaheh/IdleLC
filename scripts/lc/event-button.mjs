/** Compose a client event shortcut without keeping the old icon inside its frame. */
import sharp from 'sharp'

export async function eventButton(frame, mark, brightness = 1) {
  const { data, info } = await sharp(frame)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const border = 2
  for (let y = border; y < info.height - border; y++) {
    const t = (y - border) / (info.height - 2 * border - 1)
    for (let x = border; x < info.width - border; x++) {
      const i = (y * info.width + x) * 4
      for (let c = 0; c < 3; c++)
        data[i + c] = Math.round([34, 17, 6][c] * (1 - t) + [87, 73, 53][c] * t)
      data[i + 3] = 255
    }
  }
  const picture = await sharp(mark)
    .resize(104, 104, { fit: 'inside' })
    .modulate({ brightness })
    .png()
    .toBuffer()
  const { width, height } = await sharp(picture).metadata()
  return sharp(data, { raw: info })
    .resize(128, 128)
    .composite([
      { input: picture, left: Math.round((128 - width) / 2), top: Math.round((128 - height) / 2) },
    ])
    .webp({ lossless: true })
    .toBuffer()
}
