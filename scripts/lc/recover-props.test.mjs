import { Document, NodeIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { appendRecoveredProps } from './recover-props.mjs'

function document(models) {
  const doc = new Document()
  const scene = doc.createScene('props')
  doc.getRoot().setDefaultScene(scene)
  const buffer = doc.createBuffer()
  for (const [id, x, color] of models) {
    const positions = doc
      .createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([x, 0, 0, x + 1, 0, 0, x, 1, 0]))
      .setBuffer(buffer)
    const indices = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array([0, 1, 2]))
      .setBuffer(buffer)
    const material = doc.createMaterial(`${id}-material`).setBaseColorFactor(color)
    const primitive = doc
      .createPrimitive()
      .setAttribute('POSITION', positions)
      .setIndices(indices)
      .setMaterial(material)
    const mesh = doc.createMesh(id).addPrimitive(primitive)
    scene.addChild(doc.createNode(id).setMesh(mesh).setTranslation([0, 2, 0]))
  }
  return doc
}

const placement = (index, x = 10) => [index, x, 3, 20, 45, 0, 0, 1]
const manifest = (models, instances) => ({
  models: models.map((id) => ({ id, low: id === 'grass' })),
  instances,
})

describe('append recovered props', () => {
  it('keeps existing geometry and materials while adding only missing model placements', async () => {
    const old = document([['tree', 0, [0.2, 0.3, 0.4, 1]]])
    // A different copy of the existing tree must not overwrite the committed one.
    const recovered = document([
      ['grass', 20, [0.1, 0.8, 0.1, 1]],
      ['tree', 1000, [1, 0, 0, 1]],
    ])
    const existing = manifest(['tree'], [placement(0)])
    const fresh = manifest(['grass', 'tree'], [placement(0), placement(1), placement(1, 900)])
    const node = old.getRoot().getDefaultScene().listChildren()[0]
    const primitive = node.getMesh().listPrimitives()[0]
    const positions = primitive.getAttribute('POSITION')
    const material = primitive.getMaterial()
    const result = appendRecoveredProps(old, existing, recovered, fresh)
    expect(result).toMatchObject({ addedModels: 1, addedInstances: 1 })
    expect(result.document).toBe(old)
    expect(result.json.models).toEqual([
      { id: 'tree', low: false },
      { id: 'grass', low: true },
    ])
    expect(result.json.models[0]).toBe(existing.models[0])
    expect(result.json.instances).toEqual([placement(0), placement(1)])
    expect(result.json.instances[0]).toBe(existing.instances[0])
    expect(node.getMesh().listPrimitives()[0].getAttribute('POSITION')).toBe(positions)
    expect(node.getMesh().listPrimitives()[0].getMaterial()).toBe(material)
    expect(old.getRoot().listBuffers()).toHaveLength(1)

    // The append must also remain valid after the single-buffer GLB is written and loaded.
    const io = new NodeIO()
    const loaded = await io.readBinary(await io.writeBinary(result.document))
    const tree = loaded
      .getRoot()
      .getDefaultScene()
      .listChildren()
      .find((n) => n.getName() === 'tree')
    const saved = tree.getMesh().listPrimitives()[0]
    expect([...saved.getAttribute('POSITION').getArray()]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
    expect(saved.getMaterial().getBaseColorFactor()).toEqual([0.2, 0.3, 0.4, 1])
    expect([...saved.getIndices().getArray()]).toEqual([0, 1, 2])
    expect(tree.getTranslation()).toEqual([0, 2, 0])
  })

  it('is idempotent and leaves the document and manifest untouched when no models are new', () => {
    const old = document([['tree', 0, [1, 1, 1, 1]]])
    const fresh = document([['tree', 50, [1, 0, 0, 1]]])
    const existing = manifest(['tree'], [placement(0)])
    const result = appendRecoveredProps(old, existing, fresh, manifest(['tree'], [placement(0)]))
    expect(result.json).toBe(existing)
    expect(result.addedModels).toBe(0)
    expect(old.getRoot().listNodes()).toHaveLength(1)
    expect(old.getRoot().listMaterials()).toHaveLength(1)
  })

  it.each([{ instances: [placement(0, 11)] }, { instances: [] }])(
    'rejects changed or missing existing world placements before copying any resources',
    ({ instances }) => {
      const old = document([['tree', 0, [1, 1, 1, 1]]])
      const fresh = document([
        ['tree', 0, [1, 1, 1, 1]],
        ['grass', 2, [0, 1, 0, 1]],
      ])
      expect(() =>
        appendRecoveredProps(
          old,
          manifest(['tree'], [placement(0)]),
          fresh,
          manifest(['tree', 'grass'], [...instances, placement(1)]),
        ),
      ).toThrow(/does not preserve existing placement/)
      expect(old.getRoot().listNodes()).toHaveLength(1)
      expect(old.getRoot().listMaterials()).toHaveLength(1)
    },
  )

  it('accounts for duplicate placement counts, not just set membership', () => {
    const old = document([['tree', 0, [1, 1, 1, 1]]])
    const fresh = document([['tree', 0, [1, 1, 1, 1]]])
    expect(() =>
      appendRecoveredProps(
        old,
        manifest(['tree'], [placement(0), placement(0)]),
        fresh,
        manifest(['tree'], [placement(0)]),
      ),
    ).toThrow(/does not preserve existing placement/)
  })

  it('rejects a manifest index that does not name an existing model', () => {
    const old = document([['tree', 0, [1, 1, 1, 1]]])
    const fresh = document([['tree', 0, [1, 1, 1, 1]]])
    expect(() =>
      appendRecoveredProps(
        old,
        manifest(['tree'], [placement(0)]),
        fresh,
        manifest(['tree'], [placement(5)]),
      ),
    ).toThrow(/invalid prop placement/)
  })
})
