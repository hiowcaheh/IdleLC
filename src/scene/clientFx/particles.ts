/**
 * The client's particle systems (Engine/Effect/CParticle*.cpp), step for step: a group's emitter
 * adds particles at its rate (CParticlesEmitter::TimeProcessAndAddParticle), each common process
 * changes them in order, then the absorption moves them and ends the ones whose life is over.
 * Pure: no three.js, so it can be tested and stepped at any rate. Units are the client's
 * (metres, seconds, degrees; Y up).
 */
import type { EmitterDef, ForceDef, ParticleGroupDef, ParticleProcessDef, Track } from './data.ts'

export type Vec3 = [number, number, number]
/** w, x, y, z */
export type Quat = [number, number, number, number]

export const IDENTITY: Quat = [1, 0, 0, 0]

// ---------------------------------------------------------------- vectors and quaternions

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const lerpNum = (a: number, b: number, t: number) => a + (b - a) * t
const lerpVec = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerpNum(a[0], b[0], t),
  lerpNum(a[1], b[1], t),
  lerpNum(a[2], b[2], t),
]
/** FLOAT3D::SafeNormalize: a zero vector stays zero. */
function normalize(a: Vec3): Vec3 {
  const l = length(a)
  return l > 1e-6 ? scale(a, 1 / l) : [0, 0, 0]
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a
  const [bw, bx, by, bz] = b
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]
}

/** VectorRotate / RotateVector: v turned by q. */
export function rotate(v: Vec3, q: Quat): Vec3 {
  const [w, x, y, z] = q
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ]
}

export function quatFromAxisAngle(axis: Vec3, radians: number): Quat {
  const n = normalize(axis)
  const s = Math.sin(radians / 2)
  return [Math.cos(radians / 2), n[0] * s, n[1] * s, n[2] * s]
}

const RAD = Math.PI / 180

/** FLOATquat3D::FromEuler: heading about Y, then pitch about X, then banking about Z (degrees). */
export function quatFromEuler(angle: readonly number[]): Quat {
  const h = quatFromAxisAngle([0, 1, 0], (angle[0] ?? 0) * RAD)
  const p = quatFromAxisAngle([1, 0, 0], (angle[1] ?? 0) * RAD)
  const b = quatFromAxisAngle([0, 0, 1], (angle[2] ?? 0) * RAD)
  return quatMultiply(quatMultiply(h, p), b)
}

export function slerp(t: number, a: Quat, b: Quat): Quat {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  let to = b
  if (cos < 0) {
    cos = -cos
    to = [-b[0], -b[1], -b[2], -b[3]]
  }
  if (cos > 0.9999) {
    const q: Quat = [
      lerpNum(a[0], to[0], t),
      lerpNum(a[1], to[1], t),
      lerpNum(a[2], to[2], t),
      lerpNum(a[3], to[3], t),
    ]
    const l = Math.hypot(...q) || 1
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
  }
  const angle = Math.acos(cos)
  const s = Math.sin(angle)
  const wa = Math.sin((1 - t) * angle) / s
  const wb = Math.sin(t * angle) / s
  return [
    a[0] * wa + to[0] * wb,
    a[1] * wa + to[1] * wb,
    a[2] * wa + to[2] * wb,
    a[3] * wa + to[3] * wb,
  ]
}

// ---------------------------------------------------------------- the client's random table

const RANDOM_COUNT = 4096

/** CRandomTable: precomputed random points and factors, read in turn (the client's own tables). */
export class RandomTable {
  private pos: Vec3[] = []
  private dir: Vec3[] = []
  private cylinderPos: Vec3[] = []
  private cylinderDir: Vec3[] = []
  private factor: number[] = []
  private index = { pos: 0, dir: 0, cylinderPos: 0, cylinderDir: 0, factor: 0 }

  constructor(random: () => number = Math.random) {
    const half = () => random() * 2 - 1
    for (let i = 0; i < RANDOM_COUNT; i++) {
      this.pos.push(scale(normalize([half(), half(), half()]), random()))
      const disk = scale(normalize([half(), 0, half()]), random())
      this.cylinderPos.push([disk[0], random(), disk[2]])
      const ring = normalize([half(), 0, half()])
      this.cylinderDir.push([ring[0], random(), ring[2]])
      this.dir.push(normalize([half(), half(), half()]))
      this.factor.push(random())
    }
  }
  private next(key: keyof RandomTable['index']): number {
    this.index[key] = this.index[key] + 1 < RANDOM_COUNT ? this.index[key] + 1 : 0
    return this.index[key]
  }
  /** A point in the unit ball. */
  rndPos(): Vec3 {
    return this.pos[this.next('pos')]!
  }
  /** A unit direction. */
  rndDir(): Vec3 {
    return this.dir[this.next('dir')]!
  }
  /** x/z in the unit disc, y in [0, 1). */
  rndCylinderPos(): Vec3 {
    return this.cylinderPos[this.next('cylinderPos')]!
  }
  /** x/z on the unit circle, y in [0, 1). */
  rndCylinderDir(): Vec3 {
    return this.cylinderDir[this.next('cylinderDir')]!
  }
  /** [0, 1). */
  rndFactor(): number {
    return this.factor[this.next('factor')]!
  }
}

let shared: RandomTable | null = null
/** The one table every system reads, as in the client. */
export function randomTable(): RandomTable {
  return (shared ??= new RandomTable())
}

// ---------------------------------------------------------------- sample tracks (CSampleSpline)

/** CSampleSpline::Value with linear interpolation; colours lerp per channel. */
export function sampleNumber(track: readonly Track<number>[], key: number): number {
  const n = track.length
  if (!n) return 0
  if (key <= track[0]!.time) return track[0]!.value
  if (key >= track[n - 1]!.time) return track[n - 1]!.value
  let i = 1
  while (track[i]!.time < key) i++
  const a = track[i - 1]!,
    b = track[i]!
  return lerpNum(a.value, b.value, (key - a.time) / (b.time - a.time))
}

export function sampleVector(track: readonly Track<readonly number[]>[], key: number): number[] {
  const n = track.length
  if (!n) return [0, 0, 0]
  if (key <= track[0]!.time) return [...track[0]!.value]
  if (key >= track[n - 1]!.time) return [...track[n - 1]!.value]
  let i = 1
  while (track[i]!.time < key) i++
  const a = track[i - 1]!,
    b = track[i]!
  const t = (key - a.time) / (b.time - a.time)
  return a.value.map((v, k) => lerpNum(v, b.value[k] ?? v, t))
}

/** LerpColorInline: each of the four 8-bit channels (RGBA packed as 0xRRGGBBAA). */
export function lerpColor(a: number, b: number, t: number): number {
  let out = 0
  for (let shift = 24; shift >= 0; shift -= 8) {
    const ca = (a >>> shift) & 255,
      cb = (b >>> shift) & 255
    out = out * 256 + Math.round(lerpNum(ca, cb, t))
  }
  return out >>> 0
}

export function sampleColor(track: readonly Track<number>[], key: number): number {
  const n = track.length
  if (!n) return 0xffffffff
  if (key <= track[0]!.time) return track[0]!.value >>> 0
  if (key >= track[n - 1]!.time) return track[n - 1]!.value >>> 0
  let i = 1
  while (track[i]!.time < key) i++
  const a = track[i - 1]!,
    b = track[i]!
  return lerpColor(a.value, b.value, (key - a.time) / (b.time - a.time))
}

/** A track's key range, the period the dynamic state repeats it with. */
const period = <T>(track: readonly Track<T>[]) =>
  track.length > 1 ? track[track.length - 1]!.time - track[0]!.time : 0
/** The age a repeating track is read at (the cnt * life subtraction of DynamicState). */
function repeatAge<T>(track: readonly Track<T>[], age: number): number {
  const life = period(track)
  if (track.length <= 1 || life === 0) return age
  return age - Math.trunc(age / life) * life
}

// ---------------------------------------------------------------- particles

export interface Particle {
  life: number
  age: number
  width: number
  height: number
  row: number
  col: number
  mass: number
  /** 0xRRGGBBAA */
  color: number
  position: Vec3
  direction: Quat
  velocity: Vec3
  acceleration: Vec3
  /** Where it is drawn (m_vFinalPos). */
  final: Vec3
}

function moveAcceleration(p: Particle, dt: number) {
  p.position = add(add(p.position, scale(p.velocity, dt)), scale(p.acceleration, 0.5 * dt * dt))
  p.velocity = add(p.velocity, scale(p.acceleration, dt))
}

/** Where a tag is now: the group's emitter, processes and absorption follow it. */
export interface Placement {
  position: Vec3
  rotation: Quat
}

/** Finds a tag for a point-goal process; null when the character has none of that name. */
export type TagLookup = (name: string) => Placement | null

/**
 * CParticleGroup: one running copy of a PTGR, with its own particles. `process` returns false
 * once the emitter has nothing left to add and every particle is gone.
 */
export class ParticleSystem {
  readonly def: ParticleGroupDef
  particles: Particle[] = []
  private left: number
  private processed = 0
  private center: Vec3 = [0, 0, 0]
  private direction: Quat = IDENTITY
  private coneSource: Vec3 | null = null
  /** Cylinder emitters stretched between a group tag's two points (SetShapeSize). */
  private shapeHeight: number | null = null

  private readonly random: RandomTable
  private readonly tags: TagLookup

  constructor(
    def: ParticleGroupDef,
    random: RandomTable = randomTable(),
    tags: TagLookup = () => null,
  ) {
    this.def = def
    this.random = random
    this.tags = tags
    this.left = def.emitter?.totalCount ?? 0
  }

  setPlacement(position: Vec3, rotation: Quat): void {
    this.center = position
    this.direction = rotation
  }

  /** CParticleGroup::Stop: no more new particles; the living ones play out. */
  stop(): void {
    this.left = 0
  }

  /** CParticlesEmitter::Restart (a repeating effect starts its emitter again). */
  restart(): void {
    this.processed = 0
    this.left += this.def.emitter?.totalCount ?? 0
  }

  setShapeSize(size: number): void {
    this.shapeHeight = size
  }

  process(dt: number): boolean {
    const { emitter, absorption } = this.def
    if (!emitter || !absorption) return false
    if (this.particles.length === 0 && this.left <= 0) return false
    if (dt === 0) return true
    this.emit(emitter, dt)
    for (const process of this.def.processes) this.runProcess(process, dt)
    this.absorb(dt)
    return true
  }

  // ---- emitter

  private addCount(emitter: EmitterDef, dt: number): number {
    this.processed += dt
    if (this.left <= 0) return 0
    let count: number
    if (emitter.countPerSecond === 999999) count = this.left
    else {
      const expected = Math.trunc(this.processed * emitter.countPerSecond)
      const created = Math.max(0, emitter.totalCount - this.left)
      count = expected - created
    }
    if (count <= 0) return 0
    if (this.left >= count) this.left -= count
    else {
      count = this.left
      this.left = 0
    }
    return count
  }

  /** CParticlePrototype::CreateTo */
  private create(emitter: EmitterDef): Particle {
    const p = emitter.particle
    const r = () => this.random.rndFactor()
    const q = p.quaternion
    return {
      row: p.row,
      col: p.col,
      life: lerpNum(p.life[0], p.life[1], r()),
      age: 0,
      width: lerpNum(p.width[0], p.width[1], r()),
      height: lerpNum(p.height[0], p.height[1], r()),
      mass: lerpNum(p.mass[0], p.mass[1], r()),
      direction: slerp(r(), [q.w[0], q.x[0], q.y[0], q.z[0]], [q.w[1], q.x[1], q.y[1], q.z[1]]),
      color: lerpColor(p.color[0] >>> 0, p.color[1] >>> 0, r()),
      position: [0, 0, 0],
      velocity: [0, 0, 0],
      acceleration: [0, 0, 0],
      final: [0, 0, 0],
    }
  }

  private speed(emitter: { speed: [number, number] }): number {
    return this.random.rndFactor() * (emitter.speed[1] - emitter.speed[0]) + emitter.speed[0]
  }

  private emit(emitter: EmitterDef, dt: number) {
    const count = this.addCount(emitter, dt)
    for (let i = 0; i < count; i++) {
      const p = this.create(emitter)
      p.age = (i * dt) / count
      if (emitter.kind === 'sphere') this.emitSphere(emitter, p)
      else if (emitter.kind === 'cone') this.emitCone(emitter, p)
      else this.emitCylinder(emitter, p)
      this.particles.push(p)
    }
  }

  private emitSphere(emitter: Extract<EmitterDef, { kind: 'sphere' }>, p: Particle) {
    const { radiusInner, radiusOuter, center } = emitter.shape
    const radius = this.random.rndFactor() * (radiusOuter - radiusInner) + radiusInner
    const point = add(scale(this.random.rndDir(), radius), center)
    // the force over the emitter's delay gives the starting speed; the position is then set anew
    p.acceleration = scale(rotate(forceAt(emitter.force, point), this.direction), emitter.delay)
    moveAcceleration(p, emitter.delay)
    p.position = emitter.local ? point : add(rotate(point, this.direction), this.center)
  }

  private conePoint(shape: Extract<EmitterDef, { kind: 'cone' }>['shape']): Vec3 {
    const height =
      this.random.rndFactor() * (shape.heightUpper - shape.heightLower) + shape.heightLower
    const hot = height * Math.tan(shape.hotspot * RAD)
    const fall = height * Math.tan(shape.falloff * RAD)
    const radius = this.random.rndFactor() * (fall - hot) + hot
    let point = this.random.rndCylinderDir()
    if (shape.closeRange !== 0 && shape.lerpRatio !== 0) {
      this.coneSource ??= this.random.rndCylinderDir()
      const d = sub(point, this.coneSource)
      if (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] < shape.closeRange * shape.closeRange) {
        point = normalize(lerpVec(point, this.coneSource, shape.lerpRatio))
      } else this.coneSource = point
    }
    const out = scale(point, radius)
    out[1] = height
    return add(out, shape.center)
  }

  private emitCone(emitter: Extract<EmitterDef, { kind: 'cone' }>, p: Particle) {
    const center = rotate(emitter.shape.center, this.direction)
    p.position = add(this.center, center)
    const pos = rotate(sub(this.conePoint(emitter.shape), emitter.shape.center), this.direction)
    if (emitter.useShapePosition) p.position = add(pos, p.position)
    if (emitter.useShapeSpeed) {
      const dir = normalize(pos)
      p.velocity = scale(dir, this.speed(emitter))
      if (this.def.render === 2) p.position = add(p.position, scale(dir, p.height))
      else if (this.def.render === 3) p.position = add(p.position, scale(p.velocity, p.height))
    }
  }

  private emitCylinder(emitter: Extract<EmitterDef, { kind: 'cylinder' }>, p: Particle) {
    const shape = emitter.shape
    const height =
      this.shapeHeight === null
        ? shape.height
        : shape.height >= 0
          ? this.shapeHeight
          : -this.shapeHeight
    p.position = this.center
    let local: Vec3 = [0, 0, 0]
    if (emitter.useShapePosition) {
      // CCylinderDoubleSpace::GetPointInThis
      const radius =
        this.random.rndFactor() * (shape.radiusOuter - shape.radiusInner) + shape.radiusInner
      const d = this.random.rndCylinderDir()
      local = add([d[0] * radius, d[1] * height, d[2] * radius], shape.center)
      p.position = emitter.local ? local : add(rotate(local, this.direction), this.center)
    }
    if (emitter.useShapeSpeed) {
      if (!emitter.emitAllDirections) {
        const up: Vec3 = emitter.local ? [0, 1, 0] : rotate([0, 1, 0], this.direction)
        p.velocity = scale(up, this.speed(emitter))
      } else if (emitter.useShapePosition) {
        const middle = add([0, height * 0.5, 0], shape.center)
        p.velocity = scale(rotate(sub(local, middle), this.direction), this.speed(emitter))
      } else p.velocity = scale(this.random.rndDir(), this.speed(emitter))
    }
  }

  // ---- common processes

  private runProcess(process: ParticleProcessDef, dt: number) {
    switch (process.kind) {
      case 'dynamic':
        for (const p of this.particles) dynamicState(process, p, dt)
        break
      case 'force':
        for (const p of this.particles) {
          let force: Vec3 = [0, 0, 0]
          for (const f of process.forces)
            force = add(force, forceAt(f, sub(p.position, this.center)))
          p.acceleration = scale(force, 1 / (p.mass || 1))
        }
        break
      case 'pointGoal': {
        let goal: Vec3 = add(this.center, process.point)
        const tag = process.tag ? this.tags(process.tag) : null
        if (tag) goal = add(rotate(process.point, tag.rotation), tag.position)
        for (const p of this.particles) {
          const dir = normalize(sub(goal, p.position))
          p.acceleration = [0, 0, 0]
          const wanted = lerpVec(p.velocity, scale(dir, process.speed), process.lerpRatio)
          p.velocity = lerpVec(p.velocity, wanted, dt / (process.lerpSpeed || dt))
        }
        break
      }
      case 'control': {
        const axis = normalize(rotate([0, 1, 0], this.direction))
        const turn = quatFromAxisAngle(axis, dt * process.angleSpeed * RAD)
        // CT_CIRCLE 0, CT_SPIRAL 1 (CT_NONE -1 is stored as 0xFFFFFFFF)
        const spiral = process.type === 1
        if (process.type !== 0 && !spiral) break
        for (const p of this.particles) {
          const rel = sub(p.position, this.center)
          let next = rotate(rel, turn)
          if (spiral) next = add(next, scale(axis, process.heightSpeed * dt))
          if (process.dependRadius) continue
          if (process.useParticlePosition) p.position = add(next, this.center)
          else p.velocity = scale(sub(next, rel), 1 / dt)
        }
        break
      }
      case 'velocity': {
        const v = rotate(normalize(process.direction), this.direction)
        for (const p of this.particles)
          if (p.velocity[0] === 0 && p.velocity[1] === 0 && p.velocity[2] === 0)
            p.velocity = scale(v, process.speed)
        break
      }
    }
  }

  // ---- absorption (CParticlesAbsorption::MoveProcess, LifeProcess)

  private absorb(dt: number) {
    const absorption = this.def.absorption!
    const kept: Particle[] = []
    for (const p of this.particles) {
      switch (absorption.move) {
        case 1:
        case 4:
          p.position = add(p.position, scale(p.velocity, dt))
          break
        case 2:
        case 5:
          moveAcceleration(p, dt)
          break
      }
      p.final =
        absorption.move >= 3 ? add(rotate(p.position, this.direction), this.center) : p.position
      if (absorption.dependLife) {
        p.age += dt
        if (p.life <= p.age) continue
      }
      kept.push(p)
    }
    this.particles = kept
  }
}

/** CForce::GetForce */
export function forceAt(force: ForceDef, at: Vec3): Vec3 {
  switch (force.type) {
    case 1:
      return scale(force.direction, force.power)
    case 2:
      return scale(normalize(sub(at, force.position)), force.power)
    case 3: {
      const d = sub(at, force.position)
      const l = length(d)
      return l < 0.000001 ? [0, 0, 0] : scale(d, (force.power / l) * 0.0001)
    }
    case 4: {
      const d = sub(at, force.position)
      const l = length(d)
      return l < 0.000001 ? [0, 0, 0] : scale(d, force.power * l * 0.0001)
    }
    default:
      return [0, 0, 0]
  }
}

/** CParticlesProcessDynamicState::Process for one particle. */
export function dynamicState(
  def: Extract<ParticleProcessDef, { kind: 'dynamic' }>,
  p: Particle,
  dt: number,
): void {
  const rgb = def.color.length ? sampleColor(def.color, p.age) >>> 8 : p.color >>> 8
  let alpha = p.color & 255
  let alphaProcess = false
  let base = 255
  if (def.alpha.length) {
    alphaProcess = true
    base = sampleNumber(def.alpha, repeatAge(def.alpha, p.age))
  }
  let twinkle = 1
  const twinklePeriod = def.twinkle ?? 0
  if (twinklePeriod > 0.0001) {
    alphaProcess = true
    const value = Math.floor(p.age / twinklePeriod)
    twinkle =
      value & 1
        ? (p.age - twinklePeriod * value) / twinklePeriod
        : (twinklePeriod * (value + 1) - p.age) / twinklePeriod
  }
  let fade = 1
  if (p.age < def.fadeIn) {
    alphaProcess = true
    fade = p.age / def.fadeIn
  } else if (p.life - p.age < def.fadeOut) {
    alphaProcess = true
    fade = (p.life - p.age) / def.fadeOut
  }
  if (alphaProcess) {
    if (!def.alpha.length) base = 255
    alpha = Math.max(0, Math.min(255, Math.trunc(base * twinkle * fade)))
  }
  p.color = ((rgb << 8) | alpha) >>> 0
  if (def.texPos.length) {
    const key = repeatAge(def.texPos, p.age)
    let i = 0
    while (i < def.texPos.length - 1 && def.texPos[i]!.time < key) i++
    const [row, col] = def.texPos[i]!.value
    p.row = row
    p.col = col
  }
  if (def.size.length) {
    const [w, h] = sampleVector(def.size, repeatAge(def.size, p.age))
    p.width = w ?? p.width
    p.height = h ?? p.height
  }
  if (def.mass.length) p.mass = sampleNumber(def.mass, p.age)
  if (def.deltaPos.length) {
    const now = sampleVector(def.deltaPos, p.age)
    const before = sampleVector(def.deltaPos, p.age - dt)
    p.position = add(p.position, sub(now as Vec3, before as Vec3))
  }
  if (def.angle.length) {
    const now = sampleVector(def.angle, p.age)
    const before = sampleVector(def.angle, p.age - dt)
    p.direction = quatMultiply(p.direction, quatFromEuler(now.map((v, i) => v - (before[i] ?? 0))))
  }
}

/** CParticle::RenderQuad: the quad's turn around the view axis, from its direction (radians). */
export function particleAngle(p: Particle): number {
  const w = Math.max(-1, Math.min(1, p.direction[0]))
  return Math.abs(Math.abs(w) - 1) < 1e-6 ? 0 : 2 * Math.acos(w)
}

/** The far end of a line / trail particle (CParticle::RenderLine, RenderTrail…). */
export function particleTail(p: Particle, render: number): Vec3 {
  if (render === 1) return add(p.position, rotate([0, p.height, 0], p.direction))
  if (render === 2) return add(p.position, scale(normalize(p.velocity), -p.height))
  return add(p.position, scale(p.velocity, -p.height))
}
