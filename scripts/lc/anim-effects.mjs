/** ModelInstance.cpp:1732,2005. AEFF count followed by complete ANEF records. */
import { Reader } from './binary.mjs'

export function parseAnimationEffects(buffer) {
  const r = new Reader(buffer)
  if (r.id() !== 'AEFF') throw new Error('missing AEFF header')
  const count = r.u32()
  if (count > r.remaining / 13) throw new Error('invalid animation effect count')
  const records = {}
  for (let i = 0; i < count; i++) {
    if (r.id() !== 'ANEF' || r.u8() !== 1) throw new Error('unsupported ANEF record')
    const animation = r.string()
    if (!animation || records[animation]) throw new Error('invalid animation effect name')
    const groups = r.u32()
    if (groups > r.remaining / 12) throw new Error('invalid reserved effect count')
    records[animation] = Array.from({ length: groups }, () => {
      const group = r.string(),
        delay = r.f32(),
        flags = r.u32()
      if (!Number.isFinite(delay)) throw new Error('invalid reserved effect time')
      return { group, delay, flags }
    })
  }
  if (r.remaining) throw new Error('trailing animation effect data')
  return records
}
