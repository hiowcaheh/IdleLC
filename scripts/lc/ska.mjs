/** Serious Engine SKA skeleton (.bs v6) and animation set (.ba v14) readers — plain formats. */
import { Reader } from './binary.mjs'

export function parseSkeleton(buffer) {
  const r = new Reader(buffer)
  if (r.id() !== 'SKEL') throw new Error('not a SKEL file')
  const version = r.u32()
  if (version !== 6) throw new Error(`unsupported skeleton version ${version}`)
  const lods = []
  for (let l = 0, n = r.u32(); l < n; l++) {
    const lod = { source: r.string(), maxDistance: r.f32(), bones: [] }
    for (let b = 0, ct = r.u32(); b < ct; b++) {
      const bone = { name: r.string(), parent: r.string(), abs: r.floats(12) }
      const rel = r.floats(7)
      bone.relPos = [rel[0], rel[1], rel[2]]
      bone.relRot = [rel[3], rel[4], rel[5], rel[6]] // w, x, y, z
      bone.offsetLength = r.f32()
      bone.length = r.f32()
      lod.bones.push(bone)
    }
    lods.push(lod)
  }
  return { lods, end: r.o }
}

export function parseAnimSet(buffer, wanted = null) {
  const r = new Reader(buffer)
  if (r.id() !== 'ANIM') throw new Error('not an ANIM file')
  const version = r.u32()
  if (version !== 14) throw new Error(`unsupported animset version ${version}`)
  const anims = []
  for (let a = 0, n = r.u32(); a < n; a++) {
    const anim = { source: r.string(), name: r.string() }
    anim.secondsPerFrame = r.f32()
    anim.frames = r.u32()
    anim.threshold = r.f32()
    anim.compressed = r.u32()
    anim.customSpeed = r.u32()
    if (anim.compressed) throw new Error(`compressed animation ${anim.name} is not supported`)
    anim.bones = []
    for (let b = 0, ct = r.u32(); b < ct; b++) {
      const env = { bone: r.string(), defaultPos: r.floats(12), positions: [], rotations: [] }
      for (let k = 0, cp = r.u32(); k < cp; k++) {
        const frame = r.u16()
        r.u16()
        env.positions.push({ frame, value: Array.from(r.floats(3)) })
      }
      for (let k = 0, cr = r.u32(); k < cr; k++) {
        const frame = r.u16()
        r.u16()
        env.rotations.push({ frame, value: Array.from(r.floats(4)) }) // w, x, y, z
      }
      env.offsetLength = r.f32()
      anim.bones.push(env)
    }
    for (let m = 0, cm = r.u32(); m < cm; m++) {
      r.string()
      r.floats(r.u32())
    }
    if (!wanted || wanted.has(anim.name.toLowerCase())) anims.push(anim)
  }
  return { anims, end: r.o }
}
