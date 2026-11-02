import { describe, expect, it } from 'vitest'
import { parseSkillAnims, parseSkillTable } from './skill-anims.mjs'
import { Writer } from './test-utils.mjs'

// Independent fixture encoder for the serializer in Engine/Entities/Skill.cpp.
function record({ id, job = 0, maxLevel = 1, weapons = [], afterEffect = '' }) {
  const w = new Writer().u32(id).u32(job).u32(0).u32(0).u8(0).u32(0).u32(0).u8(maxLevel)
  w.floats([0, 0, 0]).u8(0)
  w.u32(0).u32(0).u32(0)
  for (let i = 0; i < 3; i++) w.u32(0xffffffff).u8(0)
  for (let i = 0; i < 6; i++) w.u32(0)
  for (let i = 0; i < 2; i++) {
    const { ready = '', still = '', fire = '', effect = '' } = weapons[i] ?? {}
    for (const name of [ready, effect, still, fire, effect, '', '']) w.string(name)
    w.u8(0).floats([0, 0, 0, 0]).u8(0).u8(0).floats([0, 0, 0, 0]).f32(0)
  }
  w.string(afterEffect)
    .u32(1)
    .u32(2)
    .u32(3)
    .bytes(Buffer.alloc(maxLevel * 141))
  return w.toBuffer()
}

function seal(payload) {
  // FileSecure adds every fifth little-endian word; partial final reads retain previous high bytes.
  const previous = Buffer.alloc(4)
  let checksum = 0
  for (let i = 0; i < payload.length; i += 20) {
    payload.copy(previous, 0, i, Math.min(payload.length, i + 4))
    checksum = (checksum + previous.readInt32LE()) | 0
  }
  return Buffer.concat([payload, new Writer().u32(checksum).toBuffer()])
}

function table(records, lastIndex = 50) {
  return seal(
    Buffer.concat([
      new Writer().u32(lastIndex).toBuffer(),
      ...records.map(record),
      new Writer().u32(-9999).toBuffer(),
    ]),
  )
}

const prefixes = { knight: 'ni', mage: 'ma' }

describe('source-defined skills.lod', () => {
  it('reads named phases without using effect text, naming suffixes or the other weapon variant', () => {
    const input = table([
      { id: 14, weapons: [{ fire: 'ni_skill_01' }, { fire: 'ni_a_skill_01' }] },
      {
        id: 31,
        job: 4,
        maxLevel: 2,
        weapons: [
          {
            ready: 'ma_skill_ready',
            still: 'ma_skill_hold',
            fire: 'ma_skill_fire',
            effect: 'ni_skill_fake',
          },
          { fire: 'ma_a_skill_fire' },
        ],
        afterEffect: 'ma_skill_not_an_animation',
      },
    ])
    expect(
      parseSkillAnims(
        input,
        [
          { id: 14, classId: 'knight' },
          { id: 31, classId: 'mage' },
        ],
        prefixes,
      ),
    ).toEqual(
      new Map([
        [14, { fire: 'ni_skill_01' }],
        [31, { ready: 'ma_skill_ready', still: 'ma_skill_hold', fire: 'ma_skill_fire' }],
      ]),
    )
    const parsed = parseSkillTable(input)
    expect(parsed.end).toBe(input.length)
    expect(parsed.records[1]).toMatchObject({
      id: 31,
      job: 4,
      maxLevel: 2,
      icon: { texture: 1, row: 2, col: 3 },
      afterEffect: 'ma_skill_not_an_animation',
    })
    expect(parsed.records[1].weapons[1].fire).toBe('ma_a_skill_fire')
  })

  it('takes only requested skills and matching class clips, preserving empty phases', () => {
    const input = table([
      { id: 14, weapons: [{ fire: 'ma_skill_01' }] },
      { id: 15, weapons: [{ ready: 'ni_prepare', fire: 'ni_release' }] },
      { id: 16, weapons: [{ fire: 'ni_unrequested' }] },
    ])
    expect(
      parseSkillAnims(
        input,
        [
          { id: 14, classId: 'knight' },
          { id: 15, classId: 'knight' },
        ],
        prefixes,
      ),
    ).toEqual(new Map([[15, { ready: 'ni_prepare', fire: 'ni_release' }]]))
  })

  it('rejects truncated tables and checksum corruption', () => {
    const input = table([{ id: 14 }])
    expect(() => parseSkillTable(input.subarray(0, 8))).toThrow(/truncated/)
    const damaged = Buffer.from(input)
    damaged[20] ^= 1
    expect(() => parseSkillTable(damaged)).toThrow(/checksum/)
    const truncated = seal(input.subarray(0, input.length - 10))
    expect(() => parseSkillTable(truncated)).toThrow()
  })

  it('rejects bad ids, duplicate records and extra bytes after the terminator', () => {
    expect(() => parseSkillTable(table([{ id: 51 }]))).toThrow(/id 51/)
    expect(() => parseSkillTable(table([{ id: 14 }, { id: 14 }]))).toThrow(/duplicate/)
    const input = table([])
    const trailing = seal(Buffer.concat([input.subarray(0, -4), Buffer.alloc(4)]))
    expect(() => parseSkillTable(trailing)).toThrow(/after.*terminator/)
  })

  it('rejects a string length outside the file instead of scanning for another apparent clip', () => {
    const payload = table([{ id: 14, weapons: [{ fire: 'ni_skill_01' }] }]).subarray(0, -4)
    payload.writeUInt32LE(0x7fffffff, 94) // first weapon ready-animation length
    expect(() => parseSkillTable(seal(payload))).toThrow(/length|range|truncated/)
  })
})
