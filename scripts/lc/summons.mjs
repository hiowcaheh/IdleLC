/**
 * The Sorcerer's elementals as the client draws them: Engine/SlaveInfo.cpp (CSlaveInfo) names the
 * .smc of each and its clips (walk, idle, run, damage, die, two attacks). Model id → definition.
 */
const slave = (file, prefix, { walk = 'run', water = false } = {}) => ({
  smc: `Data\\NPC\\Summon\\${file}.smc`,
  animations: {
    idle: `${prefix}_idle01`,
    walk: `${prefix}_${walk}`,
    run: `${prefix}_run`,
    attack: [`${prefix}_att01`, `${water ? 'Summon_water' : prefix}_att02`],
    hit: `${prefix}_dam`,
    die: `${prefix}_die`,
  },
})

export const SUMMON_MODELS = {
  summonfire: slave('summonfire', 'summon_fire'),
  summonwind: slave('summonwind', 'summon_wind', { walk: 'walk' }),
  summonland: slave('summonland', 'summon_earth'),
  summonwater: slave('summonwater', 'summon_water', { walk: 'walk', water: true }),
}
