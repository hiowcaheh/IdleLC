import { describe, expect, it } from 'vitest'
import { CLASSES } from '../data/classes.ts'
import { MONSTERS } from '../data/monsters.ts'
import { getModel, listModels, modelUrl } from './manifest.ts'

describe('asset manifest', () => {
  it('has a model for every class and monster', () => {
    for (const c of Object.values(CLASSES)) expect(() => getModel(c.modelId)).not.toThrow()
    for (const m of Object.values(MONSTERS)) expect(() => getModel(m.modelId)).not.toThrow()
  })

  it('has unique ids', () => {
    const ids = listModels().map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('builds URLs from the asset base', () => {
    expect(modelUrl(getModel('hero'))).toMatch(/models\/RobotExpressive\.glb$/)
  })
})
