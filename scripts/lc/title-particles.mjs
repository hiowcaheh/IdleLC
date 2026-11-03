/** Bounded Effect.dat particle reader. Layouts: CParticleGroup.cpp:150–202,
 * CParticlesProcessDynamicState.cpp:Read, CParticlesEmitter*.cpp:Read and CParticle.cpp:PTPT.
 * Unsupported versions/types fail explicitly; source files stay outside the repository.
 */
import { Reader } from './binary.mjs'
const expect = (r, id) => {
  const actual = r.id()
  if (actual !== id) throw new Error(`expected ${id}, got ${actual} at ${r.o - 4}`)
}
const ver = (r, vs) => {
  const v = r.u8()
  if (!vs.includes(v)) throw new Error(`version ${v} unsupported at ${r.o - 1}`)
  return v
}
const f = (r) => {
  const x = r.f32()
  if (!Number.isFinite(x)) throw new Error(`nonfinite at ${r.o - 4}`)
  return x
}
const vec = (r) => [f(r), f(r), f(r)]
const flag = (r) => {
  const x = r.i32()
  if (x !== 0 && x !== 1) throw new Error(`invalid BOOL ${x} at ${r.o - 4}`)
  return Boolean(x)
}
const count = (r) => {
  const x = r.u32()
  if (x > 100000 || x > r.remaining) throw new Error(`invalid count ${x}`)
  return x
}
const line = (r) => {
  const at = r.buf.indexOf(10, r.o)
  if (at < 0 || at - r.o > 1023) throw new Error('invalid line')
  return r
    .bytes(at - r.o + 1)
    .toString('latin1')
    .replace(/[\r\n]/g, '')
}
const file = (r) => {
  expect(r, 'DFNM')
  return r.string()
}
function samples(r, read) {
  return Array.from({ length: count(r) }, () => ({ time: f(r), value: read(r) }))
}
function dynamic(r) {
  expect(r, 'PPDS')
  const v = ver(r, [2, 3, 4, 5])
  const out = { kind: 'dynamic' }
  if (v === 2) {
    out.random = f(r)
    out.combineColorAlpha = flag(r)
  } else out.twinkle = f(r)
  out.fadeIn = f(r)
  out.fadeOut = f(r)
  for (const [n, read] of [
    ['color', (r) => r.u32()],
    ['alpha', (r) => r.u8()],
    ['texPos', (r) => [r.u8(), r.u8()]],
    ['size', (r) => [f(r), f(r)]],
    ['mass', f],
    ['deltaPos', vec],
    ...(v >= 4 ? [['angle', v === 4 ? (r) => [f(r), f(r), f(r), f(r)] : vec]] : []),
  ])
    out[n] = flag(r) ? samples(r, read) : []
  return out
}
function force(r) {
  expect(r, 'FOCE')
  ver(r, [1])
  return { type: r.u32(), power: f(r), position: vec(r), direction: vec(r) }
}
function process(r, type) {
  if (type === 1) return dynamic(r)
  if (type === 2) {
    expect(r, 'PTPF')
    const v = ver(r, [1, 2])
    const out = { kind: 'force', forces: Array.from({ length: count(r) }, () => force(r)) }
    if (v === 1) out.random = f(r)
    return out
  }
  if (type === 3) {
    expect(r, 'PPPG')
    const v = ver(r, [1, 2])
    return {
      kind: 'pointGoal',
      lerpRatio: f(r),
      lerpSpeed: f(r),
      speed: f(r),
      point: vec(r),
      tag: v >= 2 ? r.string() : '',
    }
  }
  if (type === 4) {
    expect(r, 'PTPC')
    const v = ver(r, [1, 2])
    return {
      kind: 'control',
      type: r.u32(),
      useParticlePosition: flag(r),
      angleSpeed: f(r),
      heightSpeed: f(r),
      dependRadius: v >= 2 ? flag(r) : false,
    }
  }
  if (type === 5) {
    expect(r, 'PTPF')
    ver(r, [1])
    return { kind: 'velocity', direction: vec(r), speed: f(r) }
  }
  throw new Error(`unsupported process ${type}`)
}
function prototype(r) {
  expect(r, 'PTPT')
  ver(r, [1])
  return {
    life: [f(r), f(r)],
    width: [f(r), f(r)],
    height: [f(r), f(r)],
    row: r.u8(),
    col: r.u8(),
    mass: [f(r), f(r)],
    color: [r.u32(), r.u32()],
    quaternion: { w: [f(r), f(r)], x: [f(r), f(r)], y: [f(r), f(r)], z: [f(r), f(r)] },
  }
}
function sphere(r) {
  expect(r, 'SDSP')
  ver(r, [1])
  return { radiusOuter: f(r), radiusInner: f(r), center: vec(r) }
}
function cylinder(r) {
  expect(r, 'CDSP')
  ver(r, [1])
  return { height: f(r), radiusInner: f(r), radiusOuter: f(r), center: vec(r) }
}
function cone(r) {
  expect(r, 'CDSP')
  const v = ver(r, [1, 2])
  return {
    heightUpper: f(r),
    heightLower: f(r),
    hotspot: f(r),
    falloff: f(r),
    center: vec(r),
    closeRange: v >= 2 ? f(r) : 0,
    lerpRatio: v >= 2 ? f(r) : 0,
  }
}
function emitter(r, type) {
  expect(r, 'PTEM')
  const v = ver(r, [1, 2])
  const out = {
    type,
    totalCount: r.u32(),
    countPerSecond: f(r),
    particle: prototype(r),
    local: v >= 2 ? flag(r) : false,
  }
  if (type === 1) {
    expect(r, 'PEMS')
    ver(r, [1])
    return { ...out, kind: 'sphere', force: force(r), delay: f(r), shape: sphere(r) }
  }
  if (type === 2) {
    expect(r, 'PECN')
    ver(r, [1])
    return {
      ...out,
      kind: 'cone',
      speed: [f(r), f(r)],
      useShapePosition: flag(r),
      useShapeSpeed: flag(r),
      shape: cone(r),
    }
  }
  if (type === 3) {
    expect(r, 'PECY')
    const v = ver(r, [1, 2])
    return {
      ...out,
      kind: 'cylinder',
      speed: [f(r), f(r)],
      useShapePosition: flag(r),
      useShapeSpeed: flag(r),
      emitAllDirections: v >= 2 ? flag(r) : false,
      shape: cylinder(r),
    }
  }
  throw new Error(`unsupported emitter ${type}`)
}
function absorption(r, type) {
  expect(r, 'PTAB')
  ver(r, [1])
  const out = { type, move: r.u32(), dependLife: flag(r) }
  if (type === 1) {
    expect(r, 'PADF')
    ver(r, [1])
    return { ...out, kind: 'default' }
  }
  if (type === 2) {
    expect(r, 'PASP')
    ver(r, [1])
    return { ...out, kind: 'sphere', shape: sphere(r) }
  }
  throw new Error(`unsupported absorption ${type}`)
}
export function readParticleGroup(buffer, offset = 0) {
  const r = new Reader(buffer, offset)
  expect(r, 'PTGR')
  ver(r, [1])
  const out = {
    name: line(r),
    texture: file(r),
    render: r.u32(),
    blend: r.u32(),
    mexWidth: r.i32(),
    mexHeight: r.i32(),
    col: r.i32(),
    row: r.i32(),
  }
  out.processes = Array.from({ length: count(r) }, () => process(r, r.u32()))
  out.emitter = flag(r) ? emitter(r, r.u32()) : null
  out.absorption = flag(r) ? absorption(r, r.u32()) : null
  return { group: out, bytesRead: r.o - offset }
}
