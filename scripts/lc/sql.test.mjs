import { describe, expect, it } from 'vitest'
import { int, parseValues, readTables } from './sql.mjs'

const DUMP = `
CREATE TABLE \`t_npc\` (
  \`a_index\` int(11) NOT NULL,
  \`a_name\` varchar(50) NOT NULL,
  \`a_level\` varchar(10) DEFAULT NULL,
  PRIMARY KEY (\`a_index\`)
) ENGINE=MyISAM;
CREATE TABLE \`t_other\` (
  \`x\` int(11)
);
INSERT INTO \`t_other\` VALUES (1),(2);
INSERT INTO \`t_npc\` VALUES (60,'Fox','1'),(61,'It\\'s ''quoted'' (a), b);','3'),(62,NULL,-2.5);
INSERT INTO \`t_npc\` VALUES (63,'Line\\nbreak','8');
`

describe('parseValues', () => {
  it('handles escapes, doubled quotes, NULL and numbers', () => {
    const start = DUMP.indexOf('VALUES (60') + 7
    const { rows } = parseValues(DUMP, start)
    expect(rows).toEqual([
      [60, 'Fox', '1'],
      [61, "It's 'quoted' (a), b);", '3'],
      [62, null, -2.5],
    ])
  })
})

describe('readTables', () => {
  it('maps rows to column names and skips unrequested tables', () => {
    const t = readTables(DUMP, ['t_npc'])
    expect(Object.keys(t)).toEqual(['t_npc'])
    expect(t.t_npc).toHaveLength(4)
    expect(t.t_npc[1]).toEqual({ a_index: 61, a_name: "It's 'quoted' (a), b);", a_level: '3' })
    expect(t.t_npc[3].a_name).toBe('Line\nbreak')
  })

  it('matches table names ignoring case, like the LC dump needs', () => {
    const dump = `CREATE TABLE \`t_skillLevel\` (\n  \`a_index\` int(11),\n  \`a_level\` int(11)\n) ENGINE=MyISAM;
INSERT INTO \`t_skilllevel\` VALUES (14,1),(14,2);`
    expect(readTables(dump, ['t_skilllevel']).t_skilllevel).toEqual([
      { a_index: 14, a_level: 1 },
      { a_index: 14, a_level: 2 },
    ])
  })

  it('int() converts text numbers', () => {
    expect(int('8')).toBe(8)
    expect(int(null)).toBe(0)
    expect(int('abc')).toBe(0)
  })
})
