/**
 * Draws running model effects (EFMD) the way CMdlEffect::Render sets up CModelObject: the model at
 * its placement, stretched, tinted by its blend colour, each surface blended by its translucency
 * (RenderModel_View.cpp SetRenderingParameters: add → src·alpha + dst, translucent → alpha
 * blend), over everything when the effect says so (RMF_OVERDRAW). Face-forward models turn to
 * the viewer (RenderModel.cpp PrepareView): fully, keeping only their banking, or about their own
 * up axis.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Quaternion,
  RepeatWrapping,
  ShaderMaterial,
  SrcAlphaFactor,
  Vector2,
  Vector3,
  Vector4,
  ZeroFactor,
  type BlendingDstFactor,
  type BlendingSrcFactor,
  type Camera,
  type Texture,
} from 'three'
import type { ModelDef } from './data.ts'
import { particleTexture } from './ParticleMeshes.ts'
import type { LiveModel } from './player.ts'

const VERTEX = /* glsl */ `
uniform vec2 uMex;
varying vec2 vUv;
void main() {
  // texture vertices are in mex from the top left; GL textures are flipped
  vUv = vec2(uv.x * uMex.x, 1.0 - uv.y * uMex.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec4 uColor;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(uMap, vUv) * uColor;
  if (color.a < 0.004) discard;
  gl_FragColor = color;
  #include <colorspace_fragment>
}
`

/** Model textures repeat (a cylinder's band wraps around); the image is shared with particles. */
const repeating = new Map<string, Texture>()
function modelTexture(url: string): Texture {
  let texture = repeating.get(url)
  if (!texture) {
    texture = particleTexture(url).clone()
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.needsUpdate = true
    repeating.set(url, texture)
  }
  return texture
}

/** The geometry of each model and frame, shared by every effect that draws it. */
const geometries = new WeakMap<ModelDef, BufferGeometry[][]>()
function surfaceGeometries(model: ModelDef, frame: number): BufferGeometry[] {
  let perFrame = geometries.get(model)
  if (!perFrame) {
    const uv = new BufferAttribute(Float32Array.from(model.uv), 2)
    perFrame = model.frames.map((points) => {
      const position = new BufferAttribute(Float32Array.from(points), 3)
      return model.surfaces.map((surface) => {
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', position)
        geometry.setAttribute('uv', uv)
        geometry.setIndex(surface.index)
        return geometry
      })
    })
    geometries.set(model, perFrame)
  }
  return perFrame[Math.min(frame, perFrame.length - 1)] ?? []
}

/** Surface translucency → GL factors (STT_ADD is PBT_ADDALPHA; opaque ones fade as translucent). */
function blendFactors(translucency: number): [BlendingSrcFactor, BlendingDstFactor] {
  switch (translucency) {
    case 3:
      return [SrcAlphaFactor, OneFactor]
    case 5:
      return [ZeroFactor, OneMinusSrcAlphaFactor]
    default:
      return [SrcAlphaFactor, OneMinusSrcAlphaFactor]
  }
}

/** Channel products of two 0xRRGGBBAA colours (MulColors). */
function mulColors(a: number, b: number): [number, number, number, number] {
  return [24, 16, 8, 0].map(
    (shift) => (((a >>> shift) & 255) * ((b >>> shift) & 255)) / (255 * 255),
  ) as [number, number, number, number]
}

const matrix = new Matrix4()
const bankTurn = new Quaternion()
const toCamera = new Vector3()
const up = new Vector3()
const side = new Vector3()
const facing = new Vector3()
const Z_AXIS = new Vector3(0, 0, 1)

/** One running model effect: a group of meshes, one per surface. */
export class ModelEffectMesh {
  readonly object = new Group()
  readonly live: LiveModel
  private readonly materials: ShaderMaterial[]
  private readonly meshes: Mesh[]
  private frame = -1

  constructor(live: LiveModel) {
    this.live = live
    const { model, texture, def } = live
    const map = modelTexture(texture.url)
    const mex = new Vector2(
      1 / (texture.mexWidth ?? texture.width),
      1 / (texture.mexHeight ?? texture.height),
    )
    this.materials = model.surfaces.map((surface) => {
      const [src, dst] = blendFactors(surface.translucency)
      return new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uMap: { value: map },
          uMex: { value: mex },
          uColor: { value: new Vector4(1, 1, 1, 1) },
        },
        transparent: true,
        depthWrite: false,
        depthTest: !def.overDraw,
        side: surface.doubleSided ? DoubleSide : FrontSide,
        blending: CustomBlending,
        blendSrc: src,
        blendDst: dst,
        blendSrcAlpha: ZeroFactor,
        blendDstAlpha: OneFactor,
        toneMapped: false,
      })
    })
    this.meshes = this.materials.map((material) => {
      const mesh = new Mesh(undefined, material)
      mesh.frustumCulled = false
      mesh.renderOrder = 11
      this.object.add(mesh)
      return mesh
    })
  }

  /** Copies the effect's look and placement; billboards turn to the camera. */
  update(camera: Camera): void {
    const live = this.live
    const model = live.model
    // the first animation, looped (CMdlEffect::Start PlayAnim(0, AOF_LOOPING))
    const anim = model.anim
    const step =
      anim && anim.frames.length > 1 && anim.secsPerFrame > 0
        ? Math.floor(live.age / anim.secsPerFrame) % anim.frames.length
        : 0
    const frame = anim?.frames[step] ?? 0
    if (frame !== this.frame) {
      const geometries = surfaceGeometries(model, frame)
      this.meshes.forEach((mesh, i) => (mesh.geometry = geometries[i]!))
      this.frame = frame
    }
    model.surfaces.forEach((surface, i) => {
      const [r, g, b, a] = mulColors(surface.color, live.color)
      // the client's colours are sRGB bytes
      ;(this.materials[i]!.uniforms.uColor!.value as Vector4).set(r ** 2.2, g ** 2.2, b ** 2.2, a)
    })
    const [x, y, z] = live.position
    this.object.position.set(x, y, z)
    this.object.scale.set(live.stretch[0], live.stretch[1], live.stretch[2])
    const [w, qx, qy, qz] = live.rotation
    const turn = this.object.quaternion.set(qx, qy, qz, w)
    if (model.faceForward === 1) {
      // only the banking of the effect's turn, in the view's plane
      const e = matrix.makeRotationFromQuaternion(turn).elements
      const sinP = -e[9]!
      const cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP))
      const bank = cosP > 0.001 ? Math.atan2(e[1]! / cosP, e[5]! / cosP) : 0
      bankTurn.setFromAxisAngle(Z_AXIS, bank)
      this.object.quaternion.copy(camera.quaternion).multiply(bankTurn)
    } else if (model.faceForward === 2) {
      // about its own up axis, its face toward the viewer
      up.set(0, 1, 0).applyQuaternion(turn).normalize()
      camera.getWorldPosition(toCamera).sub(this.object.position)
      facing.copy(toCamera).addScaledVector(up, -toCamera.dot(up))
      if (facing.lengthSq() < 1e-8) facing.set(0, 0, 1).applyQuaternion(camera.quaternion)
      facing.normalize()
      side.crossVectors(up, facing).normalize()
      matrix.makeBasis(side, up, facing)
      this.object.quaternion.setFromRotationMatrix(matrix)
    }
  }

  dispose(): void {
    // geometries are shared per model; the materials are this effect's own
    for (const material of this.materials) material.dispose()
  }
}
