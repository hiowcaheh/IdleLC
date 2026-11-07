/**
 * Draws trails (EFSB, EFTC) as the client's strips: vertex colours times the texture, blended by
 * the effect's PredefinedBlendType, no depth writes, both sides.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Mesh,
  OneFactor,
  ShaderMaterial,
  ZeroFactor,
  type Camera,
} from 'three'
import { blendFactors, particleTexture } from './ParticleMeshes.ts'
import type { Vec3 } from './particles.ts'
import type { LiveTrail } from './player.ts'

const VERTEX = /* glsl */ `
attribute vec4 color;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  // the client's vertex colours are sRGB bytes
  vColor = vec4(pow(color.rgb, vec3(2.2)), color.a);
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTextured;
uniform float uAdd;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 color = vColor * (uTextured > 0.5 ? texture2D(uMap, vUv) : vec4(1.0));
  if (uAdd > 0.5) color.a = 1.0;
  if (color.a < 0.004) discard;
  gl_FragColor = color;
  #include <colorspace_fragment>
}
`

/** Steps a strip holds; longer ones draw their newest part. */
const MAX_STEPS = 256

const viewer: Vec3 = [0, 0, 0]

export class TrailMesh {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>
  readonly live: LiveTrail
  private readonly position = new BufferAttribute(new Float32Array(MAX_STEPS * 2 * 3), 3)
  private readonly color = new BufferAttribute(new Float32Array(MAX_STEPS * 2 * 4), 4)
  private readonly uv = new BufferAttribute(new Float32Array(MAX_STEPS * 2 * 2), 2)

  constructor(live: LiveTrail) {
    this.live = live
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', this.position)
    geometry.setAttribute('color', this.color)
    geometry.setAttribute('uv', this.uv)
    // two triangles a step (CTraceEffect / CSplineBillboardEffect m_vectorIndex)
    const index: number[] = []
    for (let i = 0; i + 1 < MAX_STEPS; i++) {
      const v = i * 2
      index.push(v, v + 1, v + 2, v + 2, v + 1, v + 3)
    }
    geometry.setIndex(index)
    geometry.setDrawRange(0, 0)
    const [src, dst] = blendFactors(live.blend)
    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uMap: { value: live.texture ? particleTexture(live.texture.url) : null },
          uTextured: { value: live.texture ? 1 : 0 },
          uAdd: { value: live.blend === 205 ? 1 : 0 },
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
      }),
    )
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 10
  }

  /** Rebuilds the strip from the trail's samples as seen from the camera. */
  update(camera: Camera): void {
    const e = camera.matrixWorld.elements
    viewer[0] = e[12]!
    viewer[1] = e[13]!
    viewer[2] = e[14]!
    const strip = this.live.state.strip(viewer)
    const geometry = this.mesh.geometry
    if (!strip) {
      geometry.setDrawRange(0, 0)
      return
    }
    const steps = Math.min(MAX_STEPS, strip.positions.length / 6)
    const skip = strip.positions.length / 6 - steps
    ;(this.position.array as Float32Array).set(strip.positions.slice(skip * 6, (skip + steps) * 6))
    ;(this.color.array as Float32Array).set(strip.colors.slice(skip * 8, (skip + steps) * 8))
    ;(this.uv.array as Float32Array).set(strip.uvs.slice(skip * 4, (skip + steps) * 4))
    this.position.needsUpdate = this.color.needsUpdate = this.uv.needsUpdate = true
    geometry.setDrawRange(0, Math.max(0, steps - 1) * 6)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
