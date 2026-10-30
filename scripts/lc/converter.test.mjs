import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MESH_KEY, Reader } from './binary.mjs'
import { ClientFiles, MemoryFiles } from './client.mjs'
import { parseMesh } from './mesh.mjs'
import { buildModel, inverseBindMatrix } from './model.mjs'
import { parseAnimSet, parseSkeleton } from './ska.mjs'
import { parseSmc } from './smc.mjs'
import { decodeDxt, parseTexture } from './texture.mjs'
import {
  animSetFile,
  frmcChunk,
  meshFile,
  skeletonFile,
  textureFile,
  Writer,
} from './test-utils.mjs'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
const TRIANGLE = {
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  uvs: [0, 0, 1, 0, 0, 1],
}

describe('obfuscated integers', () => {
  it('advances the XOR key by `step` on every byte after each value', () => {
    const buffer = new Writer(MESH_KEY).xint(1).xint(0).xint(0xdeadbeef).toBuffer()
    // the first value is XOR-ed with the start key 0x1e354865
    expect(buffer.readUInt32LE(0)).toBe((1 ^ 0x1e354865) >>> 0)
    const r = new Reader(buffer, 0, MESH_KEY)
    expect([r.xint(), r.xint(), r.xint()]).toEqual([1, 0, 0xdeadbeef])
  })
})

describe('parseMesh', () => {
  it('reads vertices, surfaces with absolute indices, shaders and weight maps', () => {
    const buffer = meshFile({
      positions: [...TRIANGLE.positions, 0, 0, 1],
      normals: [...TRIANGLE.normals, 0, 0, 1],
      uvs: [...TRIANGLE.uvs, 1, 1],
      surfaces: [
        {
          first: 0,
          indices: [0, 1, 2],
          name: 'body',
          shader: 'Shaders\\Default.sha',
          textures: ['skin'],
          colors: [0xffffffff],
        },
        { first: 1, indices: [0, 1, 2], name: 'tail' },
      ],
      weightMaps: [
        {
          bone: 'root',
          pairs: [
            [0, 1],
            [3, 0.5],
          ],
        },
      ],
    })
    const { lods, end } = parseMesh(buffer)
    expect(end).toBe(buffer.length)
    const [lod] = lods
    expect(lod.positions).toHaveLength(12)
    expect(lod.uvMaps[0].name).toBe('Texture')
    expect(lod.surfaces[0]).toMatchObject({
      name: 'body',
      shader: 'Shaders\\Default.sha',
      textures: ['skin'],
      colors: [0xffffffff],
    })
    // indices are stored relative to the surface's first vertex
    expect([...lod.surfaces[1].indices]).toEqual([1, 2, 3])
    expect(lod.surfaces[1].shader).toBeUndefined()
    expect(lod.weightMaps[0].bone).toBe('root')
    expect([...lod.weightMaps[0].vertices]).toEqual([0, 3])
    expect([...lod.weightMaps[0].weights]).toEqual([1, 0.5])
  })

  it('rejects other files', () => {
    expect(() => parseMesh(Buffer.from('SKEL0000'))).toThrow(/not a MESH/)
  })
})

describe('skeleton and animation set', () => {
  it('reads bones and filters clips by name, case-insensitively', () => {
    const skeleton = parseSkeleton(
      skeletonFile([{ name: 'root', abs: IDENTITY, pos: [0, 1, 0], rot: [1, 0, 0, 0] }]),
    )
    expect(skeleton.lods[0].bones[0]).toMatchObject({
      name: 'root',
      parent: '',
      relPos: [0, 1, 0],
      relRot: [1, 0, 0, 0],
    })

    const set = animSetFile([
      {
        name: 'M_Idle',
        secondsPerFrame: 0.1,
        frames: 2,
        bones: [
          {
            bone: 'root',
            positions: [{ frame: 0, value: [0, 1, 0] }],
            rotations: [{ frame: 1, value: [1, 0, 0, 0] }],
          },
        ],
      },
      { name: 'm_run', secondsPerFrame: 0.1, frames: 2, bones: [] },
    ])
    expect(parseAnimSet(set).anims.map((a) => a.name)).toEqual(['M_Idle', 'm_run'])
    const { anims, end } = parseAnimSet(set, new Set(['m_idle']))
    expect(end).toBe(set.length)
    expect(anims).toHaveLength(1)
    expect(anims[0].bones[0].rotations).toEqual([{ frame: 1, value: [1, 0, 0, 0] }])
  })
})

describe('textures', () => {
  // DXT1 block: red/blue endpoints, pixels 0-3 use palette entries 0-3
  const opaqueBlock = [0x00, 0xf8, 0x1f, 0x00, 0xe4, 0, 0, 0]
  // c0 <= c1 selects 3-colour mode; index 3 is transparent black
  const transparentBlock = [0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]

  it('decodes DXT1 palettes', () => {
    const rgba = decodeDxt(Uint8Array.from(opaqueBlock), 4, 4, false)
    expect([...rgba.subarray(0, 16)]).toEqual([
      255, 0, 0, 255, 0, 0, 255, 255, 170, 0, 85, 255, 85, 0, 170, 255,
    ])
  })

  it('uses the TDAT size for non-square DXT textures', () => {
    // an 8×4 DXT1 texture has the same mip sizes as a 4×8 one; only the header tells them apart
    const tex = parseTexture(
      textureFile(
        { width: 8, height: 4, mips: 2 },
        frmcChunk([[...opaqueBlock, ...transparentBlock], new Array(8).fill(0)]),
      ),
    )
    expect(tex).toMatchObject({ width: 8, height: 4, format: 'DXT1', alpha: true })
    expect(tex.rgba[3]).toBe(255)
    expect(tex.rgba[4 * 4 + 3]).toBe(0) // first pixel of the second block
  })

  it('reads raw RGB frames behind an encrypted header', () => {
    const pixels = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
    const tex = parseTexture(
      textureFile(
        { width: 2, height: 2 },
        Buffer.concat([Buffer.from('FRMS'), Buffer.from(pixels)]),
      ),
    )
    expect(tex).toMatchObject({ width: 2, height: 2, format: 'RGB', alpha: false })
    expect([...tex.rgba.subarray(0, 8)]).toEqual([10, 20, 30, 255, 40, 50, 60, 255])
  })
})

describe('parseSmc', () => {
  it('reads meshes with textures, skeleton, animation sets and offset', () => {
    const smc = parseSmc(`OFFSET    \t0,0,0,180,0,0;
NAME "fox";
{
  MESH       \tTFNM "Data\\Monster\\Animals\\Fox.bm";
  TEXTURES
  {
    "d1_animal"\tTFNM "Data\\Monster\\Animals\\d1_animal.tex";
  }
  MESH TFNM "Data\\Monster\\Animals\\_TAG_T_CENTER_fox.bm";
  TEXTURES { }
  SKELETON  \tTFNM "Data\\Monster\\Animals\\Fox.bs";
  ANIMSET   \tTFNM "Data\\Monster\\Animals\\Fox.ba";
  ALLFRAMESBBOX\t-0.5,0,-0.5,0.5,1,0.5;
}`)
    expect(smc.name).toBe('fox')
    expect(smc.offset).toEqual([0, 0, 0, 180, 0, 0])
    expect(smc.meshes).toEqual([
      {
        file: 'Data\\Monster\\Animals\\Fox.bm',
        textures: { d1_animal: 'Data\\Monster\\Animals\\d1_animal.tex' },
      },
      { file: 'Data\\Monster\\Animals\\_TAG_T_CENTER_fox.bm', textures: {} },
    ])
    expect(smc.skeleton).toBe('Data\\Monster\\Animals\\Fox.bs')
    expect(smc.animSets).toEqual(['Data\\Monster\\Animals\\Fox.ba'])
  })
})

describe('client files', () => {
  it('resolves paths case-insensitively below Data/, with a file-name fallback', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-client-'))
    try {
      const dir = path.join(root, 'pack 1', '2015 client', 'Data', 'Monster', 'Animals')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'Fox.bm'), 'x')
      const files = new ClientFiles([root])
      expect(files.resolve('Data\\monster\\animals\\FOX.bm')).toBe(path.join(dir, 'Fox.bm'))
      expect(files.resolve('Data\\Elsewhere\\fox.bm')).toBe(path.join(dir, 'Fox.bm'))
      expect(files.resolve('Data\\Monster\\Wolf.bm')).toBeNull()
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('inverseBindMatrix', () => {
  it('inverts a rigid SE bone matrix into a column-major MAT4', () => {
    // 90° about Y, then translated
    const m = [0, 0, 1, 1, 0, 1, 0, 2, -1, 0, 0, 3]
    const inv = inverseBindMatrix(m)
    const full = [...m, 0, 0, 0, 1] // row-major 4×4
    const product = Array.from({ length: 16 }, (_, k) => {
      const row = k >> 2
      const col = k & 3
      return [0, 1, 2, 3].reduce((s, i) => s + full[row * 4 + i] * inv[col * 4 + i], 0)
    })
    expect(product.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ])
  })
})

describe('buildModel', () => {
  const files = new MemoryFiles({
    'Data\\Test\\body.bm': meshFile({
      ...TRIANGLE,
      surfaces: [
        {
          first: 0,
          indices: [0, 1, 2],
          name: 'body',
          shader: 'Shaders\\Default.sha',
          textures: ['skin'],
          colors: [0xffffffff],
        },
        { first: 0, indices: [0, 2, 1], name: 'hidden', shader: 'Shaders\\Invisible.sha' },
      ],
      weightMaps: [
        {
          bone: 'root',
          pairs: [
            [0, 0.5],
            [1, 1],
            [2, 1],
          ],
        },
        { bone: 'Head', pairs: [[0, 1.5]] },
      ],
    }),
    'Data\\Test\\_TAG_center.bm': meshFile({
      ...TRIANGLE,
      surfaces: [{ first: 0, indices: [0, 1, 2], name: 'tag' }],
    }),
    'Data\\Test\\skin.tex': textureFile(
      { width: 2, height: 2 },
      Buffer.concat([Buffer.from('FRMS'), Buffer.alloc(12, 200)]),
    ),
    'Data\\Test\\test.bs': skeletonFile([
      { name: 'root', abs: IDENTITY, pos: [0, 0, 0], rot: [1, 0, 0, 0] },
      {
        name: 'head',
        parent: 'root',
        abs: [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0],
        pos: [0, 1, 0],
        rot: [1, 0, 0, 0],
      },
    ]),
    'Data\\Test\\test.ba': animSetFile([
      {
        name: 'idle',
        secondsPerFrame: 0.5,
        frames: 3,
        bones: [
          {
            bone: 'head',
            positions: [],
            rotations: [
              { frame: 0, value: [1, 0, 0, 0] },
              { frame: 2, value: [0, 1, 0, 0] },
            ],
          },
        ],
      },
      { name: 'run', secondsPerFrame: 0.1, frames: 2, bones: [] },
    ]),
  })
  const smc = {
    name: 'test',
    meshes: [
      { file: 'Data\\Test\\body.bm', textures: { skin: 'Data\\Test\\skin.tex' } },
      { file: 'Data\\Test\\_TAG_center.bm', textures: {} },
      { file: 'Data\\Test\\missing.bm', textures: {} },
    ],
    skeleton: 'Data\\Test\\test.bs',
    animSets: ['Data\\Test\\test.ba'],
  }

  it('builds a skinned, textured, animated glTF document', async () => {
    const { document, stats } = await buildModel(files, smc, { animations: ['IDLE'] })
    const root = document.getRoot()

    expect(stats).toMatchObject({ meshes: 1, primitives: 1, bones: 2, animations: ['idle'] })
    expect(stats.missing).toEqual(['Data\\Test\\missing.bm'])

    const [skin] = root.listSkins()
    expect(skin.listJoints().map((j) => j.getName())).toEqual(['root', 'head'])
    // inverse bind of the head (abs translation y = 1)
    expect(
      Array.from(skin.getInverseBindMatrices().getArray(), (v) => v + 0).slice(28, 31),
    ).toEqual([0, -1, 0])

    const [mesh] = root.listMeshes() // the _TAG attachment mesh is skipped
    expect(root.listMeshes()).toHaveLength(1)
    const [primitive] = mesh.listPrimitives() // the invisible surface is skipped
    expect(Array.from(primitive.getIndices().getArray())).toEqual([0, 1, 2])
    // vertex 0: head 1.5 + root 0.5 → normalized and sorted by weight
    expect(Array.from(primitive.getAttribute('JOINTS_0').getElement(0, []))).toEqual([1, 0, 0, 0])
    expect(Array.from(primitive.getAttribute('WEIGHTS_0').getElement(0, []))).toEqual([
      0.75, 0.25, 0, 0,
    ])

    const texture = primitive.getMaterial().getBaseColorTexture()
    expect(texture.getMimeType()).toBe('image/jpeg')
    expect(primitive.getMaterial().getAlphaMode()).toBe('OPAQUE')

    const [animation] = root.listAnimations()
    const [channel] = animation.listChannels()
    expect(channel.getTargetNode().getName()).toBe('head')
    expect(channel.getTargetPath()).toBe('rotation')
    expect(Array.from(channel.getSampler().getInput().getArray())).toEqual([0, 1])
    // SE (w, x, y, z) → glTF (x, y, z, w)
    expect(Array.from(channel.getSampler().getOutput().getArray())).toEqual([
      0, 0, 0, 1, 1, 0, 0, 0,
    ])
  })

  it('keeps every clip when no names are given and reports missing clips', async () => {
    expect((await buildModel(files, smc)).stats.animations).toEqual(['idle', 'run'])
    expect((await buildModel(files, smc, { animations: ['attack'] })).stats.missing).toContain(
      'animation attack',
    )
  })

  it('builds gear models with only the bones they are weighted to, and WebP textures', async () => {
    const at = (y) => [1, 0, 0, 0, 0, 1, 0, y, 0, 0, 1, 0]
    const gearFiles = new MemoryFiles({
      'Data\\Item\\glove.bm': meshFile({
        ...TRIANGLE,
        surfaces: [
          {
            first: 0,
            indices: [0, 1, 2],
            name: 'glove',
            shader: 'Shaders\\Default.sha',
            textures: ['skin'],
          },
        ],
        weightMaps: [
          {
            bone: 'Hand',
            pairs: [
              [0, 1],
              [1, 1],
              [2, 1],
            ],
          },
        ],
      }),
      'Data\\Test\\skin.tex': files.read('Data\\Test\\skin.tex'),
      'Data\\Test\\body.bs': skeletonFile([
        { name: 'root', abs: IDENTITY, pos: [0, 0, 0], rot: [1, 0, 0, 0] },
        { name: 'leg', parent: 'root', abs: at(-1), pos: [0, -1, 0], rot: [1, 0, 0, 0] },
        { name: 'arm', parent: 'root', abs: at(1), pos: [0, 1, 0], rot: [1, 0, 0, 0] },
        { name: 'hand', parent: 'arm', abs: at(2), pos: [0, 1, 0], rot: [1, 0, 0, 0] },
      ]),
    })
    const glove = {
      name: 'glove',
      meshes: [{ file: 'Data\\Item\\glove.bm', textures: { skin: 'Data\\Test\\skin.tex' } }],
      skeleton: 'Data\\Test\\body.bs',
      animSets: [],
    }
    const { document, stats } = await buildModel(gearFiles, glove, {
      animations: [],
      usedBonesOnly: true,
      webp: true,
    })
    expect(stats).toMatchObject({ meshes: 1, bones: 3, animations: [] })
    const root = document.getRoot()
    const [skin] = root.listSkins()
    // the hand and its parents: the unused leg is left out
    expect(skin.listJoints().map((j) => j.getName())).toEqual(['root', 'arm', 'hand'])
    expect(skin.getInverseBindMatrices().getCount()).toBe(3)
    const [primitive] = root.listMeshes()[0].listPrimitives()
    expect(Array.from(primitive.getAttribute('JOINTS_0').getElement(0, []))).toEqual([2, 0, 0, 0])
    expect(primitive.getMaterial().getBaseColorTexture().getMimeType()).toBe('image/webp')
    expect(root.listExtensionsUsed().map((e) => e.extensionName)).toContain('EXT_texture_webp')
  })
})
