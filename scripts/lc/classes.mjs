/**
 * Player class models composed from client parts (the database has no class models).
 * Each entry is an .smc-like description plus the logical animation → clip mapping.
 * Classes are added here as their client folders become available.
 */

/** Armor set shown on the login screen: `Data\Character\<folder>\Login\<part>.bm` + texture. */
const loginPart = (folder, part) => ({
  file: `Data\\Character\\${folder}\\Login\\${part}.bm`,
  textures: { [part]: `Data\\Character\\${folder}\\Login\\Texture\\${part}.tex` },
})

export const CLASS_MODELS = {
  'class-knight': {
    smc: {
      name: 'class-knight',
      meshes: [
        'ni_bd_L',
        'ni_bd_add_L',
        'ni_bu_L',
        'ni_bu_add_L',
        'ni_ft_L',
        'ni_hn_L',
        'ni_face_004',
        'ni_hair_003',
        'ni_sword_014',
        'ni_shield_011',
      ].map((part) => loginPart('Knight', part)),
      skeleton: 'Data\\Character\\Knight\\ni.bs',
      animSets: ['Data\\Character\\Knight\\ni.ba'],
    },
    animations: {
      idle: 'ni_idle_01',
      run: 'ni_run_01',
      walk: 'ni_walk_01',
      attack: ['ni_att_01', 'ni_att_02', 'ni_att_03', 'ni_att_04'],
      hit: 'ni_dam',
      die: 'ni_die_01',
      victory: 'ni_idle_02',
    },
  },
}
