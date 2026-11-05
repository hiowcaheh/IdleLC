/**
 * Source character-window channels (CmdMsg.cpp:559–930, UICharacterInfo.cpp:1486–1556).
 * These same channels drive combat and the character window.
 * Gear upgrade values follow PC.cpp; professions/PK/elements are not invented.
 */
import { getItem } from '../data/items.ts'
import type { ClassId, ClientCombatStats, ClientStatContext, CombatStats } from '../data/types.ts'
import { classAttributes } from './attributes.ts'
import { pieceStats, upgradeBonuses } from './itemUpgrades.ts'
import type { Equipment } from './equipment.ts'
import { optionValue, type ItemOption } from './options.ts'
import { classRatingChannels } from './ratings.ts'
import { classRecovery } from './recovery.ts'
import type { StatEffect, StatKey } from './skills.ts'

const RUN_SPEED: Record<ClassId, number> = {
  titan: 6,
  knight: 6,
  healer: 7,
  mage: 6,
  rogue: 6.5,
  sorcerer: 7,
}
const MAGIC_CLASSES: ClassId[] = ['healer', 'mage', 'sorcerer']
const MAGIC_WEAPONS = new Set([2, 5, 12, 13, 14, 15])

export function clientStatChannels(
  stats: CombatStats,
  classId: ClassId,
  level: number,
  equipment: Equipment | undefined,
  options: readonly ItemOption[],
): Pick<CombatStats, 'client' | 'clientContext' | 'recoveryOptions'> {
  const attributes = { ...classAttributes(classId, level), ...stats }
  const weaponPiece = equipment?.weapon
  const weapon = weaponPiece && getItem(weaponPiece.itemId).gear
  const subtype = weapon?.subtype ?? -1
  const ranged = subtype === 1 || subtype === 6
  const physicalAttribute = [1, 6, 7].includes(subtype) ? 'dexterity' : 'strength'
  const weaponValues = weaponPiece && pieceStats(weaponPiece)
  let armor = 0,
    resist = 0,
    rawArmor = 0,
    rawResist = 0
  for (const [slot, piece] of Object.entries(equipment ?? {})) {
    if (!piece || slot === 'weapon' || slot.startsWith('accessory')) continue
    const gear = getItem(piece.itemId).gear
    if (!gear) continue
    rawArmor += gear.defense
    rawResist += gear.magicDefense
    const values = pieceStats(piece).total
    armor += values.defense
    resist += values.magicDefense
  }
  const ratings = classRatingChannels(classId, level)
  const hitBonus = weaponPiece ? upgradeBonuses(weaponPiece).hitRate : 0
  const context: ClientStatContext = {
    classId,
    level,
    physicalAttribute,
    physicalChannel: ranged ? 'ranged' : 'melee',
    // Missing equipment means the estimator's typical gear; an explicit empty set is unarmed.
    magicWeapon:
      equipment === undefined
        ? classId === 'mage' || classId === 'sorcerer'
        : MAGIC_WEAPONS.has(subtype),
    criticalOptionRate: 0,
    deadlyOptionRate: 0,
  }
  const dexGrowth = attributes.dexterity - classAttributes(classId, 1).dexterity
  const client: ClientCombatStats = {
    physicalAttack:
      Math.trunc((attributes[physicalAttribute] * 10) / 15) + (weaponValues?.total.attack ?? 0),
    magicAttack:
      Math.trunc((attributes.intelligence * 10) / 15) + (weaponValues?.total.magicAttack ?? 0),
    physicalDefense: level * 3 + Math.trunc(armor),
    magicDefense:
      Math.trunc(level * (MAGIC_CLASSES.includes(classId) ? 1 : 0.5)) + Math.trunc(resist),
    ...ratings,
    criticalRating: 90 + Math.trunc((dexGrowth * 9) / 10),
    deadlyRating: 60 + Math.trunc((dexGrowth * 6) / 10),
    runSpeed: RUN_SPEED[classId],
    walkSpeed: 1.5,
  }
  const recoveryOptions = { hpFlat: 0, hpRate: 0, mpFlat: 0, mpRate: 0 }
  const recoveryBase = classRecovery(classId, level)
  for (const option of options) {
    const value = optionValue(option)
    switch (option.type) {
      // Option.cpp:475 and :741–746: both go to m_opRecoverHP_NoRate / m_opRecoverMP_NoRate.
      case 50:
      case 102:
        recoveryOptions.hpFlat += value
        break
      case 103:
        recoveryOptions.mpFlat += value
        break
      case 56:
        recoveryOptions.hpRate += value
        break
      case 57:
        recoveryOptions.mpRate += value
        break
      case 79:
        recoveryOptions.hpRate += Math.trunc((recoveryBase.hp * value) / 100)
        break
      case 80:
        recoveryOptions.mpRate += Math.trunc((recoveryBase.mp * value) / 100)
        break
      case 6:
        client.physicalAttack += value
        break
      case 7:
        if (!ranged) client.physicalAttack += value
        break
      case 8:
        if (ranged) client.physicalAttack += value
        break
      case 9:
        if (!ranged) client.physicalHit += value
        break
      case 10:
        if (ranged) client.physicalHit += value
        break
      // The status packet sums the melee and ranged defense option counters.
      case 11:
        client.physicalDefense += value * 2
        break
      case 12:
      case 13:
        client.physicalDefense += value
        break
      case 14:
        if (!ranged) client.physicalEvasion += value
        break
      case 15:
        if (ranged) client.physicalEvasion += value
        break
      case 16:
        client.magicAttack += value
        break
      case 17:
        client.magicHit += value
        break
      case 18:
        client.magicDefense += value
        break
      case 19:
        client.magicEvasion += value
        break
      case 20:
        client.physicalAttack += value
        client.magicAttack += value
        break
      case 21:
        client.physicalHit += value
        client.magicHit += value
        break
      case 22:
        client.physicalDefense += value * 2
        client.magicDefense += value
        break
      case 23:
        client.physicalEvasion += value
        client.magicEvasion += value
        break
      case 55:
        context.criticalOptionRate += value
        break
      case 66:
        context.deadlyOptionRate += value
        break
      case 64:
        client.runSpeed *= 1 + value / 100
        break
      case 73:
        client.physicalAttack += Math.trunc(((weapon?.attack ?? 0) * value) / 100)
        client.magicAttack += Math.trunc(((weapon?.magicAttack ?? 0) * value) / 100)
        break
      case 74:
        client.physicalDefense += 2 * Math.trunc((rawArmor * value) / 100)
        client.magicDefense += Math.trunc((rawResist * value) / 100)
        break
      case 75:
        client.physicalHit += Math.trunc((ratings.physicalHit * value) / 100)
        break
      case 76:
        client.magicHit += Math.trunc((ratings.magicHit * value) / 100)
        break
      case 77:
        client.physicalEvasion += Math.trunc((ratings.physicalEvasion * value) / 100)
        break
      case 78:
        client.magicEvasion += Math.trunc((ratings.magicEvasion * value) / 100)
        break
    }
  }
  client.physicalHit += hitBonus
  client.magicHit += hitBonus
  client.criticalRating += Math.trunc((client.criticalRating * context.criticalOptionRate) / 100)
  client.deadlyRating += Math.trunc((client.deadlyRating * context.deadlyOptionRate) / 100)
  return { client, clientContext: context, recoveryOptions }
}

/** Keep the selected normal attack and both defensive channels tied to the source sheet. */
export function bindCombatChannels(stats: CombatStats): CombatStats {
  if (!stats.clientContext && stats.physicalAttack !== undefined) {
    const magic = stats.attackType === 'magic'
    return {
      ...stats,
      attack: magic ? (stats.magicAttack ?? stats.attack) : stats.physicalAttack,
      hit: magic ? (stats.magicHit ?? stats.hit) : (stats.physicalHit ?? stats.hit),
    }
  }
  if (!stats.client || !stats.clientContext) return stats
  const c = stats.client
  const magic = stats.clientContext.magicWeapon
  return {
    ...stats,
    attack: magic ? c.magicAttack : c.physicalAttack,
    physicalAttack: c.physicalAttack,
    physicalHit: c.physicalHit,
    defense: c.physicalDefense,
    magicAttack: c.magicAttack,
    magicDefense: c.magicDefense,
    hit: magic ? c.magicHit : c.physicalHit,
    dodge: c.physicalEvasion,
    magicHit: c.magicHit,
    magicEvasion: c.magicEvasion,
    attackType: magic ? 'magic' : stats.clientContext.physicalChannel,
  }
}

/** Apply one passive/assist group to independent source channels, preserving its pre-addition rate base. */
export function applyClientStats(
  before: CombatStats,
  after: CombatStats,
  effects: readonly StatEffect[],
): void {
  if (!before.client || !before.clientContext) return
  const context = before.clientContext
  const client = { ...before.client }
  const sum = (stat: StatKey, percent: boolean) =>
    effects.reduce(
      (total, effect) =>
        total +
        (effect.stat === stat &&
        effect.percent === percent &&
        (!effect.channel || effect.channel === context.physicalChannel)
          ? effect.value
          : 0),
      0,
    )
  const apply = (base: number, stat: StatKey) =>
    base + sum(stat, false) + Math.trunc((base * sum(stat, true)) / 100)
  const physicalBefore = Math.trunc(((before[context.physicalAttribute] ?? 0) * 10) / 15)
  const physicalAfter = Math.trunc(((after[context.physicalAttribute] ?? 0) * 10) / 15)
  const magicBefore = Math.trunc(((before.intelligence ?? 0) * 10) / 15)
  const magicAfter = Math.trunc(((after.intelligence ?? 0) * 10) / 15)
  client.physicalAttack = apply(client.physicalAttack - physicalBefore, 'attack') + physicalAfter
  client.magicAttack = apply(client.magicAttack - magicBefore, 'magicAttack') + magicAfter
  client.physicalDefense =
    apply(client.physicalDefense - context.level * 3, 'defense') + context.level * 3
  const resistLevel = Math.trunc(
    context.level * (MAGIC_CLASSES.includes(context.classId) ? 1 : 0.5),
  )
  client.magicDefense = apply(client.magicDefense - resistLevel, 'magicDefense') + resistLevel
  client.physicalHit = apply(client.physicalHit, 'hit')
  client.magicHit = apply(client.magicHit, 'magicHit')
  client.physicalEvasion = apply(client.physicalEvasion, 'dodge')
  client.magicEvasion = apply(client.magicEvasion, 'magicEvasion')
  // CmdMsg.cpp:843–866 derives both weights from current DEX, before option/passive/assist rates.
  // Retain previous groups so a later DEX buff also updates their percentage bases.
  const dexBase = classAttributes(context.classId, 1).dexterity
  const dexGrowth = (after.dexterity ?? dexBase) - dexBase
  const weight = (
    base: number,
    optionRate: number,
    groups: readonly { flat: number; rate: number }[],
  ) =>
    groups.reduce(
      (value, group) => value + group.flat + Math.trunc((value * group.rate) / 100),
      base + Math.trunc((base * optionRate) / 100),
    )
  const criticalGroups = [...(context.criticalGroups ?? [])]
  const deadlyGroups = [...(context.deadlyGroups ?? [])]
  const critical = { flat: sum('critChance', false), rate: sum('critChance', true) }
  const deadly = { flat: sum('deadly', false), rate: sum('deadly', true) }
  if (critical.flat || critical.rate) criticalGroups.push(critical)
  if (deadly.flat || deadly.rate) deadlyGroups.push(deadly)
  client.criticalRating = weight(
    90 + Math.trunc((dexGrowth * 9) / 10),
    context.criticalOptionRate,
    criticalGroups,
  )
  client.deadlyRating = weight(
    60 + Math.trunc((dexGrowth * 6) / 10),
    context.deadlyOptionRate,
    deadlyGroups,
  )
  // Options already established a multiplicative base; assist movement flat powers are decimetres/s.
  client.runSpeed += sum('runSpeed', false) / 10
  client.runSpeed += (client.runSpeed * sum('runSpeed', true)) / 100
  for (const effect of effects.filter((effect) => effect.stat === 'moveSpeed'))
    client.runSpeed *= 1 + effect.value / 100
  after.client = client
  after.clientContext = { ...context, criticalGroups, deadlyGroups }
  after.moveSpeed = (client.runSpeed / RUN_SPEED[context.classId] - 1) * 100
}
