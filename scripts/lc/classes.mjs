/**
 * Player class models composed from client parts (the database has no class models).
 * Each entry is an .smc-like description plus the logical animation → clip mapping.
 * Each class wears the armor set of its login screen.
 */

/**
 * Armor set shown on the login screen: `Data\Character\<folder>\Login\<part>.bm` + the texture its
 * surfaces name (the part's own name unless given: some extra pieces reuse another's texture).
 */
const loginPart = (folder, part, texture = part) => ({
  file: `Data\\Character\\${folder}\\Login\\${part}.bm`,
  textures: { [texture]: `Data\\Character\\${folder}\\Login\\Texture\\${texture}.tex` },
})

/** A class model: the login armor set ([mesh, texture] for reused textures), skeleton, clips. */
const classModel = (name, folder, parts, skeleton, animSets) => ({
  name,
  meshes: parts.map((part) =>
    Array.isArray(part) ? loginPart(folder, ...part) : loginPart(folder, part),
  ),
  skeleton,
  animSets,
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
  'class-titan': {
    smc: classModel(
      'class-titan',
      'Titan',
      [
        'ti_bd_L',
        ['ti_bd_L_01', 'ti_bd_L'],
        'ti_bu_L',
        'ti_bu_L_01',
        'ti_ft_L',
        'ti_hn_L',
        'ti_face_001',
        'ti_hair_004',
        'ti_axe_006',
      ],
      'Data\\Character\\Titan\\ti.bs',
      ['Data\\Character\\Titan\\ti.ba'],
    ),
    animations: {
      idle: 'ti_idle_01',
      run: 'ti_run_01',
      walk: 'ti_walk_01',
      attack: ['ti_att_01', 'ti_att_02', 'ti_att_03', 'ti_att_04'],
      hit: 'ti_dam',
      die: 'ti_die_01',
      victory: 'ti_idle_02',
    },
  },
  'class-healer': {
    smc: classModel(
      'class-healer',
      'Healer',
      [
        'hw_bd_L',
        ['hw_bd01_L', 'hw_bd02_L'],
        'hw_bu_L',
        ['hw_bu01_L', 'hw_bu_L'],
        'hw_bs_L',
        'hw_ft_L',
        'hw_hn_L',
        'hw_face_003',
        'hw_hair_003',
        'hw_staff_002',
      ],
      'Data\\Character\\Healer\\hw.bs',
      ['Data\\Character\\Healer\\hw.ba'],
    ),
    animations: {
      idle: 'hw_idle_01',
      run: 'hw_run_01',
      walk: 'hw_walk_01',
      attack: ['hw_att_01', 'hw_att_02'],
      hit: 'hw_dam',
      die: 'hw_die_01',
      victory: 'hw_idle_02',
    },
  },
  'class-mage': {
    smc: classModel(
      'class-mage',
      'Mage',
      [
        'ma_bd_L',
        'ma_bs_L',
        'ma_bu_L',
        'ma_ft_L',
        'ma_hn_L',
        'ma_face_003',
        // ma_hair_000 points at the face texture; the _01 copy has the hair one
        ['ma_hair_000_01', 'ma_hair_000'],
        'ma_wand_002',
      ],
      'Data\\Character\\Mage\\ma.bs',
      ['Data\\Character\\Mage\\ma.ba'],
    ),
    animations: {
      idle: 'ma_idle_01',
      run: 'ma_run_01',
      walk: 'ma_walk_01',
      attack: ['ma_att_01', 'ma_att_02'],
      hit: 'ma_dam',
      die: 'ma_die_01',
      victory: 'ma_idle_02',
    },
  },
  'class-rogue': {
    smc: classModel(
      'class-rogue',
      'Rogue',
      [
        'ro_bd_L',
        ['ro_bd_L_01', 'ro_bd_L'],
        'ro_bu_L',
        ['ro_bu_L_01', 'ro_bu_L'],
        'ro_ft_L',
        'ro_hn_L',
        'ro_face_004',
        'ro_hair_002',
        'ro_dagger_011',
      ],
      'Data\\Character\\Rogue\\ro.bs',
      // ro.ba is stored encrypted (version 254); ro_ep1.ba holds the same basic clips
      ['Data\\Character\\Rogue\\ro_ep1.ba'],
    ),
    animations: {
      idle: 'ro_idle_01',
      run: 'ro_run_01',
      walk: 'ro_walk_01',
      attack: ['ro_att_01', 'ro_att_02', 'ro_att_03'],
      hit: 'ro_dam',
      die: 'ro_die_01',
      victory: 'ro_idle_02',
    },
  },
  'class-sorcerer': {
    smc: classModel(
      'class-sorcerer',
      'Sorcerer',
      [
        'so_bd_L',
        'so_bu_L',
        ['so_bu_L_1', 'so_bu_L'],
        'so_ft_L',
        'so_hn_L',
        'so_face_002',
        'so_hair_004',
        'so_staff_002',
      ],
      'Data\\Character\\Sorcerer\\so.bs',
      // so.ba is stored encrypted (version 254); the undead sorcerer monster has the same
      // skeleton (identical so.bs) and a readable copy of the basic clips
      ['Data\\Monster\\Undead\\Sorcerer3\\so.ba'],
    ),
    animations: {
      idle: 'so_idle_01',
      run: 'so_run_02',
      walk: 'so_run_02',
      attack: ['so_att_01', 'so_att_02', 'so_att_03'],
      hit: 'so_dam',
      die: 'so_die',
      victory: 'so_idle_02',
    },
  },
}
