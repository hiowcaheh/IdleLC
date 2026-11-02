import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { MemoryFiles } from './client.mjs'
import { textureFile, Writer } from './test-utils.mjs'
import { buildUiParts } from './ui.mjs'

/** Each source pixel identifies its column and row; unrelated atlas cells must never leak in. */
function atlas(width, height) {
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      pixels.set([x % 256, y % 256, 120, 255], at)
    }
  }
  return textureFile({ width, height, flags: 1 }, new Writer().id('FRMS').bytes(pixels).toBuffer())
}

async function pixels(image) {
  return sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

describe('UI atlas extraction', () => {
  it('joins the loading fill caps and centre without the unused atlas interval', async () => {
    const parts = await buildUiParts(
      new MemoryFiles({
        'Data/Interface/Loading/LoadingBar.tex': atlas(16, 16),
        'Data/Interface/Loading/ProgressBar.tex': atlas(64, 32),
      }),
    )
    const track = await pixels(parts['loading-track'])
    expect(track.info).toMatchObject({ width: 11, height: 11 })
    const fill = await pixels(parts['loading-fill'])
    expect(fill.info).toMatchObject({ width: 49, height: 17 })
    expect([...fill.data.subarray(35 * 4, 38 * 4)]).toEqual([
      35, 0, 120, 255, 49, 0, 120, 255, 50, 0, 120, 255,
    ])
    expect([...fill.data.subarray(-4)]).toEqual([61, 16, 120, 255])
  })

  it('extracts separate name and title three-slice frames from NamePopup', async () => {
    const parts = await buildUiParts(
      new MemoryFiles({
        'Data/Interface/NamePopup.tex': atlas(512, 256),
      }),
    )
    for (const [name, x, y, height] of [
      ['name-frame', 0, 14, 15],
      ['title-frame', 35, 31, 13],
    ]) {
      const frame = await pixels(parts[name])
      expect(frame.info).toMatchObject({ width: 14, height })
      expect([...frame.data.subarray(0, 12)]).toEqual([
        x,
        y,
        120,
        255,
        x + 1,
        y,
        120,
        255,
        x + 4,
        y,
        120,
        255,
      ])
      expect([...frame.data.subarray(12 * 4, 14 * 4)]).toEqual([
        x + 30,
        y,
        120,
        255,
        x + 31,
        y,
        120,
        255,
      ])
    }
  })

  it.each([
    ['LoadingBar', 8, 16, 'loading-track'],
    ['ProgressBar', 64, 8, 'loading-fill'],
  ])('rejects %s rectangles extending outside the atlas', async (file, width, height, part) => {
    await expect(
      buildUiParts(
        new MemoryFiles({
          [`Data/Interface/Loading/${file}.tex`]: atlas(width, height),
        }),
      ),
    ).rejects.toThrow(`UI part ${part}: rectangle`)
  })

  it('keeps absent optional atlases absent', async () => {
    expect(await buildUiParts(new MemoryFiles({}))).toEqual({})
  })
})
