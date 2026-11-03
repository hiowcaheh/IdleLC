import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { MemoryFiles } from './client.mjs'
import { blendMode, buildModel, normalizeAdditiveRgba } from './model.mjs'
import {
  readEffectGroups,
  readUpgradeEffect,
  recoverUpgradeDefinitions,
  sourceMeshTags,
} from './upgrade-effects.mjs'
import { meshFile, textureFile, Writer } from './test-utils.mjs'

const hash = (data) => createHash('sha256').update(data).digest('hex')
const line = (w, value) => w.id(`${value}\r\n`)
const base = (name, kind, version = 2) => {
  const w = line(new Writer().id('EFCT').u8(version), name).f32(9).u32(0xffffffff).f32(0).f32(0)
  if (version >= 2) w.f32(3)
  return w.id(kind)
}
const filename = (w, value) => w.id('DFNM').string(value)

function ska(name = 'fairy', version = 3) {
  const w = filename(base(name, 'EFSK').u8(version), 'Data\\Effect\\Ska\\tinkerbell.smc')
    .u32(0xff8040ff)
    .floats([0.6, 0.7, 0.8])
  if (version >= 3) w.u32(2)
  return w.u32(1).u32(0).toBuffer()
}

function spline() {
  const w = base('path', 'EFSP')
    .u8(2)
    .u32(2)
    .u32(2)
    .u32(1)
    .u32(2)
    .f32(0)
    .floats([0, 0, 0])
    .f32(9)
    .floats([1, 2, 3])
    .string('fairy')
    .floats([0.3, 0.7, 0])
  return w.toBuffer()
}

function groups(effect = 'path', tagIndex = 0) {
  const w = line(new Writer().id('EEGM').id('EGMG').u8(1).u32(1).id('EFGR').u8(1), 'ia_k_am_1')
    .id('EGEK')
    .u32(1)
    .f32(0)
  line(w, effect).id('EGTK').u32(1).f32(0).u32(tagIndex)
  return line(w, 'CENTER').id('EGEN').id('EFTE').toBuffer()
}

function effectFile(records, group = groups()) {
  const header = new Writer().id('EEFM').id('EFMG').u8(1).u32(records.length).toBuffer()
  return Buffer.concat([
    header,
    ...records.flatMap((r) => [new Writer().u32(1).toBuffer(), r]),
    group,
  ])
}

describe('additive texture conversion', () => {
  it('recovers source triangle/group attachment offsets and joint weights, rather than a joint origin', () => {
    const tags = sourceMeshTags({
      positions: Float32Array.from([0.2, 1.1, 0.05, 0.3, 1.2, 0.05]),
      normals: Float32Array.from([0, 1, 0, 1, 0, 0]),
      weightMaps: [
        { bone: 'Bip01 Pelvis', vertices: Uint32Array.from([0]), weights: Float32Array.from([1]) },
      ],
      surfaces: [
        { name: '_TAG_T_CENTER', first: 0, count: 1 },
        { name: '_TAG_G_0_BOW', first: 1, count: 1 },
      ],
    })
    expect(tags.CENTER.position[1]).toBeCloseTo(1.1)
    expect(tags.CENTER.weights).toEqual([{ bone: 'Bip01 Pelvis', weight: 1 }])
    expect(tags.__0_BOW.normal).toEqual([1, 0, 0])
  })
  it('preserves byte-space RGB contributions, including black, grey and translucent texels', () => {
    const original = Uint8Array.from([
      0, 0, 0, 255, 64, 64, 64, 255, 64, 32, 16, 128, 255, 127, 0, 32,
    ])
    const converted = normalizeAdditiveRgba(original)
    expect([...converted]).toEqual([
      0, 0, 0, 0, 255, 255, 255, 64, 255, 128, 64, 32, 255, 127, 0, 32,
    ])
    expect(original[3]).toBe(255)
    for (let i = 0; i < original.length; i += 4)
      for (let channel = 0; channel < 3; channel++)
        expect(
          Math.abs(
            (converted[i + channel] * converted[i + 3]) / 255 -
              (original[i + channel] * original[i + 3]) / 255,
          ),
        ).toBeLessThan(1)
  })

  it('keeps Add separate from Translucent when sharing the same source texture', async () => {
    expect(blendMode('Shaders\\Add.sha')).toBe('additive')
    expect(blendMode('Shaders/AddShader.sha')).toBe('additive')
    expect(blendMode('Shaders\\Translucent.sha')).toBe('alpha')
    const texture = textureFile(
      { width: 1, height: 1, flags: 1 },
      new Writer().id('FRMS').bytes([64, 32, 16, 128]).toBuffer(),
    )
    const mesh = meshFile({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      surfaces: ['Add', 'Translucent'].map((name) => ({
        first: 0,
        indices: [0, 1, 2],
        name,
        shader: `Shaders\\${name}.sha`,
        flags: 1,
        textures: ['same'],
        colors: [0xffffffff],
      })),
    })
    const files = new MemoryFiles({ 'part.bm': mesh, 'same.tex': texture })
    const { document } = await buildModel(
      files,
      {
        name: 'mixed',
        meshes: [{ file: 'part.bm', textures: { same: 'same.tex' } }],
        animSets: [],
      },
      { webp: true, unlit: true },
    )
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    const roundTrip = await io.readBinary(await io.writeBinary(document))
    const materials = roundTrip.getRoot().listMaterials()
    expect(materials.map((m) => [m.getAlphaMode(), m.getExtras().lcBlend])).toEqual([
      ['BLEND', 'additive'],
      ['BLEND', 'alpha'],
    ])
    expect(materials.every((m) => m.getDoubleSided())).toBe(true)
    const pixels = await Promise.all(
      materials.map((m) => sharp(m.getBaseColorTexture().getImage()).raw().toBuffer()),
    )
    expect([...pixels[0]]).toEqual([255, 128, 64, 32])
    // Translucent textures retain their original alpha and colour (lossy WebP RGB may vary).
    expect(pixels[1][3]).toBe(128)
    expect(pixels[1][0]).toBeLessThan(100)
  })
})

describe('bounded Effect.dat upgrade reader', () => {
  it('reads CTFileName dependency markers and both supported SKA versions', () => {
    for (const version of [2, 3]) {
      const buffer = ska('fairy', version)
      const { effect, bytesRead } = readUpgradeEffect(buffer)
      expect(bytesRead).toBe(buffer.length)
      expect(effect).toMatchObject({
        name: 'fairy',
        repeat: -1,
        model: 'Data\\Effect\\Ska\\tinkerbell.smc',
        rotation: 1,
        position: version === 3 ? 2 : 0,
      })
    }
  })

  it('retains legacy MDL metadata and dynamic controls without claiming model conversion', () => {
    const w = filename(base('legacy', 'EFMD').u8(4), 'halo.mdl')
    filename(w, 'halo.tex')
      .u32(0xffffffff)
      .floats([1, 1, 1])
      .u32(1)
      .u32(2)
      .u32(1)
      .id('ECTL')
      .u8(1)
      .floats([1, 0, 0])
      .u32(0)
      .u32(1)
      .u32(2)
      .f32(0)
      .u8(0)
      .f32(1)
      .u8(255)
      .u32(0)
      .u32(0)
      .u32(0)
      .u32(1)
    const buffer = w.toBuffer()
    const { effect, bytesRead } = readUpgradeEffect(buffer)
    expect(bytesRead).toBe(buffer.length)
    expect(effect).toMatchObject({
      kind: 'EFMD',
      model: 'halo.mdl',
      texture: 'halo.tex',
      overDraw: true,
      control: {
        alpha: [
          { time: 0, value: 0 },
          { time: 1, value: 255 },
        ],
      },
    })
  })

  it('follows spline dependencies and verifies selected record boundaries', () => {
    const data = recoverUpgradeDefinitions(effectFile([spline(), ska()]))
    expect(Object.keys(data.effects)).toEqual(['path', 'fairy'])
    expect(data.effects.path.paths[0]).toEqual({
      samples: [
        { time: 0, value: [0, 0, 0] },
        { time: 9, value: [1, 2, 3] },
      ],
      effect: 'fairy',
    })
    expect(data.groups.ia_k_am_1.tags[0].name).toBe('CENTER')
    expect(() => recoverUpgradeDefinitions(effectFile([spline()]))).toThrow(
      /missing definition fairy/,
    )
    expect(() =>
      recoverUpgradeDefinitions(effectFile([spline(), Buffer.concat([ska(), Buffer.from([0])])])),
    ).toThrow(/incomplete definition/)
  })

  it('rejects malformed counts, non-finite values, invalid tags and trailing data', () => {
    const badCount = Buffer.from(groups())
    badCount.writeUInt32LE(0xffffffff, 9)
    expect(() => readEffectGroups(badCount)).toThrow(/invalid count/)
    expect(() => readEffectGroups(groups('path', -1))).toThrow(/invalid effect key/)
    expect(() => readEffectGroups(Buffer.concat([groups(), Buffer.from([0])]))).toThrow(
      /trailing group data/,
    )
    const badFloat = Buffer.from(ska())
    badFloat.writeFloatLE(NaN, badFloat.indexOf(13) + 2)
    expect(() => readUpgradeEffect(badFloat)).toThrow(/non-finite/)
    expect(() => readUpgradeEffect(ska().subarray(0, -1))).toThrow(/out of range/)
  })
})

describe('recovered upgrade manifest', () => {
  it('contains complete tier groups and hashed, finite, animated model assets', async () => {
    const data = JSON.parse(
      fs.readFileSync(
        new URL('../../src/game/data/generated/lc-upgrade-effects.json', import.meta.url),
      ),
    )
    expect(Object.keys(data.groups)).toHaveLength(108)
    for (const prefix of ['ia_t', 'ia_k', 'i_hw', 'i_ma', 'ih_ro', 'so'])
      for (const kind of ['wp', 'wp2', 'am'])
        for (let tier = 1; tier <= 6; tier++)
          expect(data.groups[`${prefix}_${kind}_${tier}`]).toBeDefined()
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    expect(Object.keys(data.assets.models)).toHaveLength(6)
    for (const asset of Object.values(data.assets.models)) {
      const bytes = fs.readFileSync(new URL(`../../public/${asset.url}`, import.meta.url))
      expect(hash(bytes)).toBe(asset.sha256)
      const document = await io.readBinary(bytes)
      expect(document.getRoot().listAnimations().length).toBeGreaterThan(0)
      for (const accessor of document.getRoot().listAccessors())
        expect(Array.from(accessor.getArray()).every(Number.isFinite)).toBe(true)
      for (const mat of document.getRoot().listMaterials()) {
        expect(mat.getAlphaMode()).toBe('BLEND')
        expect(mat.getExtras().lcBlend).toBe('additive')
        expect(mat.getDoubleSided()).toBe(true)
      }
    }
    for (const asset of Object.values(data.assets.textures))
      expect(hash(fs.readFileSync(new URL(`../../public/${asset.url}`, import.meta.url)))).toBe(
        asset.sha256,
      )
  })
})
