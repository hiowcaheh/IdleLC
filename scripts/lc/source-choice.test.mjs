import { describe, expect, it } from 'vitest'
import { MemoryFiles } from './client.mjs'
import { chooseAnimSets } from './source-choice.mjs'
import { animSetFile } from './test-utils.mjs'

describe('canonical animation source selection', () => {
  const canonical = ['canonical.ba']
  const fallback = ['legacy.ba']
  const readable = animSetFile([{ name: 'idle', frames: 1, bones: [] }])

  it('keeps the canonical source when both versions can be read', () => {
    const files = new MemoryFiles({ 'canonical.ba': readable, 'legacy.ba': readable })
    expect(chooseAnimSets(files, canonical, fallback)).toEqual(canonical)
  })

  it('uses a readable fallback for an encrypted or absent canonical source', () => {
    const files = new MemoryFiles({
      'canonical.ba': Buffer.from('ANIM\xfe\0\0\0'),
      'legacy.ba': readable,
    })
    expect(chooseAnimSets(files, canonical, fallback)).toEqual(fallback)
    expect(chooseAnimSets(files, ['absent.ba'], fallback)).toEqual(fallback)
  })

  it('does not suppress the original error when neither source is readable', () => {
    expect(chooseAnimSets(new MemoryFiles({}), canonical, fallback)).toEqual(canonical)
  })
})
