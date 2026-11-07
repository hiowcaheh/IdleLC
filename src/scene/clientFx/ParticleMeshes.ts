/**
 * Draws ParticleSystems the way the client's DrawPort_Particles does: a quad facing the camera of
 * half-size `width`, turned by the particle's angle (Particle_RenderSquare), or a camera-facing
 * strip between a particle and its tail (Particle_RenderLine), one texture cell per particle
 * (Particle_SetTexturePart), coloured by its RGBA and blended by the group's PredefinedBlendType.
 */
import {
  CustomBlending,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  SrcAlphaFactor,
  TextureLoader,
  ZeroFactor,
  type BlendingDstFactor,
  type BlendingSrcFactor,
  type Texture,
} from 'three'
import type { ParticleGroupDef } from './data.ts'
import { particleAngle, particleTail, type ParticleSystem } from './particles.ts'

const loader = new TextureLoader()
const textures = new Map<string, Texture>()

/** Each texture once, by its URL. */
export function particleTexture(url: string): Texture {
  let texture = textures.get(url)
  if (!texture) {
    texture = loader.load(`${import.meta.env.BASE_URL}${url}`)
    texture.colorSpace = SRGBColorSpace
    textures.set(url, texture)
  }
  return texture
}

const VERTEX = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iEnd;
attribute vec4 iColor;
attribute vec4 iUv;
attribute vec2 iSize;
uniform float uLine;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec2 corner = position.xy * 2.0;
  vec4 a = viewMatrix * vec4(iPos, 1.0);
  vec4 view;
  if (uLine > 0.5) {
    vec4 b = viewMatrix * vec4(iEnd, 1.0);
    vec2 along = b.xy - a.xy;
    float len = length(along);
    vec2 dir = len > 1e-5 ? along / len : vec2(0.0, 1.0);
    vec2 across = vec2(-dir.y, dir.x);
    view = mix(a, b, corner.y * 0.5 + 0.5);
    view.xy += across * corner.x * iSize.x;
  } else {
    float c = cos(iSize.y);
    float s = sin(iSize.y);
    view = a;
    view.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * iSize.x;
  }
  gl_Position = projectionMatrix * view;
  vUv = mix(iUv.xy, iUv.zw, position.xy + 0.5);
  // the client's vertex colours are sRGB bytes
  vColor = vec4(pow(iColor.rgb, vec3(2.2)), iColor.a);
}
`
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uAdd;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 texel = texture2D(uMap, vUv);
  vec4 color = texel * vColor;
  // PBT_ADD ignores alpha (S + D); the others weigh by it in the blend state
  if (uAdd > 0.5) color.a = 1.0;
  if (color.a < 0.004) discard;
  gl_FragColor = color;
  #include <colorspace_fragment>
}
`

/** GL factors of the client's blend types (Gfx_wrapper.cpp gfxSetBlendType). */
export function blendFactors(blend: number): [BlendingSrcFactor, BlendingDstFactor] {
  switch (blend) {
    case 205: // PBT_ADD: S + D
      return [OneFactor, OneFactor]
    case 206: // PBT_ADDALPHA: S*Sa + D
      return [SrcAlphaFactor, OneFactor]
    case 208: // PBT_INVMULTIPLY: 0 + D*(1-Sa)
      return [ZeroFactor, OneMinusSrcAlphaFactor]
    default: // PBT_BLEND: S*Sa + D*(1-Sa)
      return [SrcAlphaFactor, OneMinusSrcAlphaFactor]
  }
}

/** Instances a mesh holds: more particles than this are not drawn (the client keeps no cap). */
const MAX_INSTANCES = 512

/** One mesh per running system, updated from its particles each frame. */
export class ParticleMesh {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  private readonly pos: InstancedBufferAttribute
  private readonly end: InstancedBufferAttribute
  private readonly color: InstancedBufferAttribute
  private readonly uv: InstancedBufferAttribute
  private readonly size: InstancedBufferAttribute

  readonly system: ParticleSystem

  constructor(system: ParticleSystem, texture: { url: string; width: number; height: number }) {
    this.system = system
    const def = system.def
    const capacity = Math.min(
      MAX_INSTANCES,
      Math.max(8, (def.emitter?.totalCount ?? 0) || MAX_INSTANCES),
    )
    const geometry = new InstancedBufferGeometry().copy(
      new PlaneGeometry(1, 1) as unknown as InstancedBufferGeometry,
    )
    const attribute = (size: number) =>
      new InstancedBufferAttribute(new Float32Array(capacity * size), size)
    this.pos = attribute(3)
    this.end = attribute(3)
    this.color = attribute(4)
    this.uv = attribute(4)
    this.size = attribute(2)
    geometry.setAttribute('iPos', this.pos)
    geometry.setAttribute('iEnd', this.end)
    geometry.setAttribute('iColor', this.color)
    geometry.setAttribute('iUv', this.uv)
    geometry.setAttribute('iSize', this.size)
    geometry.instanceCount = 0
    const [src, dst] = blendFactors(def.blend)
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: particleTexture(texture.url) },
        uLine: { value: def.render === 0 ? 0 : 1 },
        uAdd: { value: def.blend === 205 ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: src,
      blendDst: dst,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      toneMapped: false,
    })
    this.mesh = new Mesh(geometry, material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 10
    this.cellU = def.mexWidth / texture.width
    this.cellV = def.mexHeight / texture.height
  }
  private readonly cellU: number
  private readonly cellV: number

  /** Copies the living particles into the instance buffers. */
  update(): void {
    const def: ParticleGroupDef = this.system.def
    const particles = this.system.particles
    const count = Math.min(particles.length, this.pos.count)
    const pos = this.pos.array as Float32Array
    const end = this.end.array as Float32Array
    const color = this.color.array as Float32Array
    const uv = this.uv.array as Float32Array
    const size = this.size.array as Float32Array
    let n = 0
    for (let i = 0; i < count; i++) {
      const p = particles[i]!
      const alpha = p.color & 255
      // Particle_RenderSquare skips particles too faint or too small to see
      if (alpha < 2 || p.width < 0.0001) continue
      pos.set(p.final, n * 3)
      if (def.render !== 0) end.set(particleTail(p, def.render), n * 3)
      color[n * 4] = (p.color >>> 24) / 255
      color[n * 4 + 1] = ((p.color >>> 16) & 255) / 255
      color[n * 4 + 2] = ((p.color >>> 8) & 255) / 255
      color[n * 4 + 3] = alpha / 255
      // cell (col, row) from the top-left; GL textures are flipped, so v runs from the bottom
      const u0 = p.col * this.cellU,
        u1 = (p.col + 1) * this.cellU
      const vTop = 1 - p.row * this.cellV,
        vBottom = 1 - (p.row + 1) * this.cellV
      uv[n * 4] = u0
      uv[n * 4 + 1] = vBottom
      uv[n * 4 + 2] = u1
      uv[n * 4 + 3] = vTop
      size[n * 2] = p.width
      size[n * 2 + 1] = def.render === 0 ? particleAngle(p) : 0
      n++
    }
    const geometry = this.mesh.geometry
    geometry.instanceCount = n
    for (const a of [this.pos, this.end, this.color, this.uv, this.size]) a.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
