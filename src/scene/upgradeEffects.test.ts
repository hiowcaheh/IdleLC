import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3,
} from 'three'
import definitions from '../game/data/generated/lc-upgrade-effects.json'
import {
  additiveEffectMaterial,
  armorUpgradePlus,
  upgradeGroup,
  upgradeStep,
  weaponAnchorPosition,
  weaponAnchors,
} from './upgradeEffects.ts'

describe('client upgrade effects', () => {
  it('uses all six source thresholds, including +12', () => {
    expect([3, 4, 5, 6, 8, 10, 11, 12, 14, 15].map(upgradeStep)).toEqual([
      null,
      4,
      4,
      6,
      8,
      10,
      10,
      12,
      12,
      15,
    ])
  })

  it('takes the armor minimum of the four body pieces, independently of the weapon/helmet/shield', () => {
    const piece = (plus: number) => ({ uid: '', itemId: 0, plus })
    const equipment = {
      weapon: piece(15),
      helmet: piece(0),
      shield: piece(0),
      armor: piece(15),
      pants: piece(12),
      gloves: piece(10),
      boots: piece(14),
    }
    expect(armorUpgradePlus(equipment)).toBe(10)
    expect(armorUpgradePlus({ ...equipment, boots: undefined })).toBe(0)
    expect(armorUpgradePlus({ weapon: piece(15) })).toBe(0)
  })

  it('selects original class groups and the source weapon subtype variant', () => {
    expect(upgradeGroup('knight', 'weapon', 12, 0)).toBe('ia_k_wp_5')
    expect(upgradeGroup('knight', 'weapon', 12, 11)).toBe('ia_k_wp2_5')
    expect(upgradeGroup('sorcerer', 'armor', 15)).toBe('so_am_6')
    expect(upgradeGroup('mage', 'weapon', 3)).toBeNull()
  })

  it('keeps glow anchors on transformed weapon geometry', () => {
    const geometry = new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 2, 0], 3),
    )
    const mesh = new Mesh(geometry)
    mesh.position.set(2, 1, 3)
    const holder = new Object3D()
    holder.add(mesh)
    holder.position.set(7, 0, 0)
    holder.updateMatrixWorld(true)
    const anchors = weaponAnchors(mesh, 2)
    const point = weaponAnchorPosition(anchors[1]!, holder, new Vector3())
    expect(point.x).toBe(2)
    expect(point.y).toBeGreaterThanOrEqual(2)
    expect(point.z).toBe(3)
  })

  it('uses separate alpha blending with unpremultiplied transparent materials', () => {
    const material = additiveEffectMaterial(new MeshBasicMaterial())
    expect(material.blendSrcAlpha).toBe(material.blendDstAlpha)
    expect(material.premultipliedAlpha).toBe(false)
    expect(material.depthWrite).toBe(false)
    expect(material.toneMapped).toBe(false)
  })

  it('uses source effect group tags for bow, single sword and dual swords', () => {
    const groups = definitions.groups as Record<
      string,
      { effects: { name: string }[]; tags: { effect: number; name: string }[] }
    >
    const ringTags = (name: string) => {
      const group = groups[name]!
      return group.effects.flatMap((effect, i) =>
        effect.name.startsWith('(SKA)')
          ? group.tags.filter((tag) => tag.effect === i).map((tag) => tag.name)
          : [],
      )
    }
    expect(ringTags('i_hw_wp_6')).toEqual(['LHAND'])
    expect(ringTags('ia_k_wp_6')).toEqual(['RHAND'])
    expect(ringTags('ia_k_wp2_6')).toEqual(['LHAND', 'RHAND'])
  })
})
