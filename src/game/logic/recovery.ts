import type { ClassId, CombatStats } from '../data/types.ts'

/** CPC::ResetStat, PC.cpp:2556–2611. Values per PC_RECOVER_PULSE (three seconds). */
export function classRecovery(classId: ClassId, level: number) {
  return {
    hp: Math.trunc(((classId === 'mage' || classId === 'sorcerer' ? 80 : 120) + level) / 10),
    mp: Math.trunc(((classId === 'mage' ? 240 : classId === 'healer' ? 180 : 120) + level) / 10),
  }
}

/** Standing (not sitting), moving/attacking, then passive, assist and equipment recovery. */
export function naturalRecovery(stats: CombatStats, active: boolean): { hp: number; mp: number } {
  const context = stats.clientContext
  if (!context) return { hp: 0, mp: 0 }
  const base = classRecovery(context.classId, context.level)
  let hp = active ? 1 : Math.trunc((base.hp * 25) / 100)
  let mp = active ? 1 : Math.trunc((base.mp * 25) / 100)
  for (const group of stats.recoveryGroups ?? []) {
    hp += group.hpFlat
    hp += Math.trunc((hp * group.hpRate) / 100)
    mp += group.mpFlat
    mp += Math.trunc((mp * group.mpRate) / 100)
  }
  const options = stats.recoveryOptions
  if (options) {
    if (options.hpRate > 0) hp += Math.trunc((hp * options.hpRate) / 100)
    if (options.mpRate > 0) mp += Math.trunc((mp * options.mpRate) / 100)
    if (options.hpFlat > 0) hp += options.hpFlat
    if ((options.mpFlat ?? 0) > 0) mp += options.mpFlat!
  }
  return { hp: Math.max(0, hp), mp: Math.max(0, mp) }
}
