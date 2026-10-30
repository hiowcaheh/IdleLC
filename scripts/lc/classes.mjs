/**
 * Player class models: the body of a new character from the client (`Data\Character\<class>\xx.smc`
 * — face, hair, plain shirt, trousers, hands and feet; the database has no class models) with the
 * logical animation → clip mapping. Worn weapons and armor are separate gear models
 * (lc-item-models.json, see convert-lc.mjs) the game puts on this body.
 */

const classModel = (folder, prefix, animations, animSets) => ({
  prefix,
  smc: `Data\\Character\\${folder}\\${prefix}.smc`,
  skeleton: `Data\\Character\\${folder}\\${prefix}.bs`,
  ...(animSets ? { animSets } : {}),
  animations,
})

export const CLASS_MODELS = {
  'class-knight': classModel(
    'Knight',
    'ni',
    {
      idle: 'ni_idle_01',
      run: 'ni_run_01',
      walk: 'ni_walk_01',
      attack: ['ni_att_01', 'ni_att_02', 'ni_att_03', 'ni_att_04'],
      hit: 'ni_dam',
      die: 'ni_die_01',
      victory: 'ni_idle_02',
    },
    // the full client stores ni.ba encrypted (version 254); ni_ep1.ba holds the same basic clips
    ['Data\\Character\\Knight\\ni_ep1.ba'],
  ),
  'class-titan': classModel('Titan', 'ti', {
    idle: 'ti_idle_01',
    run: 'ti_run_01',
    walk: 'ti_walk_01',
    attack: ['ti_att_01', 'ti_att_02', 'ti_att_03', 'ti_att_04'],
    hit: 'ti_dam',
    die: 'ti_die_01',
    victory: 'ti_idle_02',
  }),
  'class-healer': classModel('Healer', 'hw', {
    idle: 'hw_idle_01',
    run: 'hw_run_01',
    walk: 'hw_walk_01',
    attack: ['hw_att_01', 'hw_att_02'],
    hit: 'hw_dam',
    die: 'hw_die_01',
    victory: 'hw_idle_02',
  }),
  'class-mage': classModel('Mage', 'ma', {
    idle: 'ma_idle_01',
    run: 'ma_run_01',
    walk: 'ma_walk_01',
    attack: ['ma_att_01', 'ma_att_02'],
    hit: 'ma_dam',
    die: 'ma_die_01',
    victory: 'ma_idle_02',
  }),
  'class-rogue': classModel(
    'Rogue',
    'ro',
    {
      idle: 'ro_idle_01',
      run: 'ro_run_01',
      walk: 'ro_walk_01',
      attack: ['ro_att_01', 'ro_att_02', 'ro_att_03'],
      hit: 'ro_dam',
      die: 'ro_die_01',
      victory: 'ro_idle_02',
    },
    // ro.ba is stored encrypted (version 254); ro_ep1.ba holds the same basic clips
    ['Data\\Character\\Rogue\\ro_ep1.ba'],
  ),
  'class-sorcerer': classModel(
    'Sorcerer',
    'so',
    {
      idle: 'so_idle_01',
      run: 'so_run_02',
      walk: 'so_run_02',
      attack: ['so_att_01', 'so_att_02', 'so_att_03'],
      hit: 'so_dam',
      die: 'so_die',
      victory: 'so_idle_02',
    },
    // so.ba is stored encrypted (version 254); the undead sorcerer monster has the same skeleton
    // (identical so.bs) and a readable copy of the basic clips
    ['Data\\Monster\\Undead\\Sorcerer3\\so.ba'],
  ),
}

/**
 * The class whose skeleton a gear model is skinned to, from its file name
 * (`Data\Item\Shield\Knight\ni_bu_001.smc` → class-knight), or undefined.
 */
export function gearClass(smcPath) {
  const prefix = String(smcPath).replace(/\\/g, '/').split('/').pop().slice(0, 3).toLowerCase()
  return Object.keys(CLASS_MODELS).find((id) => `${CLASS_MODELS[id].prefix}_` === prefix)
}
