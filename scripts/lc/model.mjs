/**
 * Assembles an LC model (parsed .smc: meshes + textures + skeleton + animation sets) into a
 * gltf-transform Document with skinning and animations. Models face +Z like the rest of the game:
 * the .smc OFFSET heading (180) only turns them for the SE camera and is ignored.
 */
import { Document } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { parseMesh } from './mesh.mjs'
import { parseAnimSet, parseSkeleton } from './ska.mjs'
import { parseTexture } from './texture.mjs'

const baseName = (p) =>
  p
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '')

/** SE quaternion (w, x, y, z) → glTF (x, y, z, w). */
export const toGltfQuat = ([w, x, y, z]) => [x, y, z, w]

/** Inverse of a rigid SE bone matrix (3×4, row-major) as a column-major glTF MAT4. */
export function inverseBindMatrix(m) {
  const t = [m[3], m[7], m[11]]
  const it = [0, 1, 2].map((i) => -(m[i] * t[0] + m[4 + i] * t[1] + m[8 + i] * t[2]))
  // columns of R^T are the rows of R
  return [m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0, it[0], it[1], it[2], 1]
}

/** SE color 0xRRGGBBAA → linear-ish RGBA factor (alpha forced to 1). */
const colorFactor = (c) =>
  [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255].map((v) => v / 255).concat(1)

/** Plain colour (linear RGB) of an unreadable texture named as gold trim (`ni_bu_017_1_gold`). */
const GOLD = [0.62, 0.42, 0.12]

/** Alpha handling by shader name; SE shaders seen so far (Default, Detail, NormalMap) are opaque. */
function alphaMode(shader = '') {
  if (/translucent|transparent|blend|add/i.test(shader)) return 'BLEND'
  if (/alpha|mask|cutout|grass|leaf/i.test(shader)) return 'MASK'
  return 'OPAQUE'
}

/** Top-4 joints/weights per vertex from the mesh weight maps. */
function skinAttributes(lod, boneIndex, vertexCount) {
  const influences = Array.from({ length: vertexCount }, () => [])
  for (const map of lod.weightMaps) {
    const bone = boneIndex.get(map.bone.toLowerCase())
    if (bone === undefined) continue
    for (let k = 0; k < map.vertices.length; k++) {
      influences[map.vertices[k]]?.push([map.weights[k], bone])
    }
  }
  const joints = new Uint16Array(vertexCount * 4)
  const weights = new Float32Array(vertexCount * 4)
  influences.forEach((list, v) => {
    const top = list.sort((a, b) => b[0] - a[0]).slice(0, 4)
    if (top.length === 0) top.push([1, 0])
    const total = top.reduce((s, [w]) => s + w, 0) || 1
    top.forEach(([w, bone], k) => {
      joints[v * 4 + k] = bone
      weights[v * 4 + k] = w / total
    })
  })
  return { joints, weights }
}

/**
 * Encodes a decoded texture as JPEG (opaque) or PNG (with alpha) — or WebP, about a third smaller
 * (EXT_texture_webp) — downscaled to `maxSize`. Results are cached per source file and alpha usage.
 */
async function encodeTexture(texture, withAlpha, maxSize, webp) {
  let image = sharp(Buffer.from(texture.rgba), {
    raw: { width: texture.width, height: texture.height, channels: 4 },
  })
  if (Math.max(texture.width, texture.height) > maxSize) {
    image = image.resize({ width: maxSize, height: maxSize, fit: 'inside' })
  }
  if (webp) {
    if (!withAlpha) image = image.removeAlpha()
    return { data: await image.webp({ quality: 82 }).toBuffer(), mimeType: 'image/webp' }
  }
  if (withAlpha) return { data: await image.png().toBuffer(), mimeType: 'image/png' }
  const data = await image.removeAlpha().jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  return { data, mimeType: 'image/jpeg' }
}

/**
 * @param files      ClientFiles / MemoryFiles
 * @param smc        parsed .smc (see smc.mjs)
 * @param options.animations  clip names to keep (case-insensitive); all clips when omitted
 * @param options.maxTextureSize  longest texture side (default 1024)
 * @param options.webp            WebP textures (EXT_texture_webp) instead of JPEG / PNG
 * @param options.usedBonesOnly   keep only the bones the meshes are weighted to (and their parents):
 *                                gear models worn on a class body that has the whole skeleton
 * @param options.fallbackColor   linear RGB for surfaces whose texture can't be read (encrypted);
 *                                without it such a texture fails the model
 * @param options.textureCache    Map shared between models of one run
 * @returns {{ document: Document, stats: object }}
 */
export async function buildModel(files, smc, options = {}) {
  const maxTextureSize = options.maxTextureSize ?? 1024
  const webp = options.webp ?? false
  const textureCache = options.textureCache ?? new Map()
  const stats = {
    meshes: 0,
    primitives: 0,
    bones: 0,
    animations: [],
    missing: [],
    unreadable: [],
    shaders: new Set(),
  }

  const doc = new Document()
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true)
  const buffer = doc.createBuffer()
  const scene = doc.createScene(smc.name || 'Scene')
  const root = doc.createNode('Root')
  scene.addChild(root)
  const accessor = (type, array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)

  // meshes to draw (tags are attachment points only), each read once
  const parts = []
  for (const desc of smc.meshes) {
    if (/^_tag/i.test(baseName(desc.file))) continue
    if (!files.resolve(desc.file)) {
      stats.missing.push(desc.file)
      continue
    }
    const lod = parseMesh(files.read(desc.file)).lods[0]
    if (lod) parts.push({ desc, lod })
  }

  // skeleton
  const bones = []
  const boneIndex = new Map()
  let skin = null
  if (smc.skeleton && files.resolve(smc.skeleton)) {
    let skeletonBones = parseSkeleton(files.read(smc.skeleton)).lods[0].bones
    if (options.usedBonesOnly) {
      const byName = new Map(skeletonBones.map((b) => [b.name.toLowerCase(), b]))
      const keep = new Set()
      for (const { lod } of parts) {
        for (const map of lod.weightMaps) {
          let bone = byName.get(map.bone.toLowerCase())
          for (; bone && !keep.has(bone); bone = byName.get(bone.parent.toLowerCase()))
            keep.add(bone)
        }
      }
      skeletonBones = skeletonBones.filter((b) => keep.has(b))
    }
    skeletonBones.forEach((b, i) => boneIndex.set(b.name.toLowerCase(), i))
    for (const b of skeletonBones) {
      bones.push(doc.createNode(b.name).setTranslation(b.relPos).setRotation(toGltfQuat(b.relRot)))
    }
    skeletonBones.forEach((b, i) => {
      const parent = boneIndex.get(b.parent.toLowerCase())
      ;(parent === undefined ? root : bones[parent]).addChild(bones[i])
    })
    skin = doc.createSkin('Skin')
    bones.forEach((node) => skin.addJoint(node))
    skin.setInverseBindMatrices(
      accessor('MAT4', new Float32Array(skeletonBones.flatMap((b) => inverseBindMatrix(b.abs)))),
    )
    stats.bones = bones.length
  } else if (smc.skeleton) {
    stats.missing.push(smc.skeleton)
  }

  // materials: one per texture file (or flat color)
  const materials = new Map()
  async function material(surface, textures) {
    const mode = alphaMode(surface.shader)
    const textureName = surface.textures?.[0]
    // a surface may name its texture differently from the .smc (`ni_bu_017_1_gold` / `ni_bu_017_1`):
    // a mesh with a single texture uses that one
    const own = Object.values(textures)
    const texturePath = textureName
      ? (textures[textureName] ?? (own.length === 1 ? own[0] : undefined))
      : undefined
    const color = surface.shader?.endsWith('Color.sha') ? surface.shaderFlags : surface.colors?.[0]
    const matKey = `${texturePath ?? ''}|${color ?? ''}|${mode}`
    if (materials.has(matKey)) return materials.get(matKey)
    const name = texturePath ? baseName(texturePath) : textureName || 'color'
    const mat = doc.createMaterial(name).setMetallicFactor(0).setRoughnessFactor(0.9)
    if (color !== undefined && color >>> 0 !== 0xffffffff)
      mat.setBaseColorFactor(colorFactor(color))
    const file = texturePath ? files.resolve(texturePath) : null
    const cacheKey = `${file}|${mode !== 'OPAQUE'}|${maxTextureSize}|${webp}`
    if (file && !textureCache.has(cacheKey)) {
      let decoded = null
      try {
        decoded = parseTexture(files.read(texturePath))
      } catch (error) {
        if (!options.fallbackColor) throw error
      }
      const withAlpha = decoded !== null && mode !== 'OPAQUE' && decoded.alpha
      textureCache.set(
        cacheKey,
        decoded && {
          ...(await encodeTexture(decoded, withAlpha, maxTextureSize, webp)),
          withAlpha,
        },
      )
    }
    const encoded = file ? textureCache.get(cacheKey) : undefined
    if (encoded) {
      mat.setBaseColorTexture(
        doc.createTexture(name).setImage(encoded.data).setMimeType(encoded.mimeType),
      )
      if (encoded.withAlpha) {
        mat.setAlphaMode(mode)
        if (mode === 'MASK') mat.setAlphaCutoff(0.5)
      }
    } else if (file) {
      // stored encrypted: the surface gets a plain colour
      if (!options.fallbackColor) throw new Error(`unreadable texture ${texturePath}`)
      stats.unreadable.push(texturePath)
      const gold = /gold/i.test(textureName ?? '')
      mat
        .setBaseColorFactor([...(gold ? GOLD : options.fallbackColor), 1])
        .setMetallicFactor(gold ? 0.6 : 0.25)
    } else if (texturePath) {
      stats.missing.push(texturePath)
    }
    materials.set(matKey, mat)
    return mat
  }

  // meshes: one glTF mesh per .bm file, one primitive per surface
  for (const { desc, lod } of parts) {
    const vertexCount = lod.positions.length / 3
    const surfaces = lod.surfaces.filter(
      (s) => s.indices.length && !/invisible/i.test(s.shader ?? ''),
    )
    if (vertexCount < 3 || surfaces.length === 0) continue

    const attributes = {
      POSITION: accessor('VEC3', lod.positions),
      NORMAL: accessor('VEC3', lod.normals),
    }
    if (lod.uvMaps.length) attributes.TEXCOORD_0 = accessor('VEC2', lod.uvMaps[0].uvs)
    if (skin) {
      const { joints, weights } = skinAttributes(lod, boneIndex, vertexCount)
      attributes.JOINTS_0 = accessor('VEC4', joints)
      attributes.WEIGHTS_0 = accessor('VEC4', weights)
    }
    const mesh = doc.createMesh(baseName(desc.file))
    for (const surface of surfaces) {
      if (surface.shader) stats.shaders.add(surface.shader)
      const indices = vertexCount > 65535 ? surface.indices : Uint16Array.from(surface.indices)
      const primitive = doc
        .createPrimitive()
        .setIndices(accessor('SCALAR', indices))
        .setMaterial(await material(surface, desc.textures))
      for (const [semantic, value] of Object.entries(attributes))
        primitive.setAttribute(semantic, value)
      mesh.addPrimitive(primitive)
      stats.primitives++
    }
    const node = doc.createNode(baseName(desc.file)).setMesh(mesh)
    if (skin) node.setSkin(skin)
    root.addChild(node)
    stats.meshes++
  }

  // animations
  if (skin) {
    const wanted = options.animations
      ? new Set(options.animations.map((a) => a.toLowerCase()))
      : null
    const added = new Set()
    for (const setPath of smc.animSets) {
      if (!files.resolve(setPath)) {
        stats.missing.push(setPath)
        continue
      }
      for (const clip of parseAnimSet(files.read(setPath), wanted).anims) {
        if (added.has(clip.name.toLowerCase())) continue
        added.add(clip.name.toLowerCase())
        const animation = doc.createAnimation(clip.name)
        for (const envelope of clip.bones) {
          const bone = bones[boneIndex.get(envelope.bone.toLowerCase())]
          if (!bone) continue
          const tracks = [
            ['translation', 'VEC3', envelope.positions, (v) => v],
            ['rotation', 'VEC4', envelope.rotations, toGltfQuat],
          ]
          for (const [targetPath, type, keys, convert] of tracks) {
            if (!keys.length) continue
            const sampler = doc
              .createAnimationSampler()
              .setInput(
                accessor(
                  'SCALAR',
                  Float32Array.from(keys, (k) => k.frame * clip.secondsPerFrame),
                ),
              )
              .setOutput(accessor(type, Float32Array.from(keys.flatMap((k) => convert(k.value)))))
              .setInterpolation('LINEAR')
            animation
              .addSampler(sampler)
              .addChannel(
                doc
                  .createAnimationChannel()
                  .setTargetNode(bone)
                  .setTargetPath(targetPath)
                  .setSampler(sampler),
              )
          }
        }
        stats.animations.push(clip.name)
      }
    }
    if (wanted) {
      for (const name of wanted) if (!added.has(name)) stats.missing.push(`animation ${name}`)
    }
  }

  return { document: doc, stats }
}
