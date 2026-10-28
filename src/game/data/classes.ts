import type { ClassDef, ClassId } from './types.ts'

// Placeholder numbers — tuned together with docs/balance.md.
export const CLASSES: Record<ClassId, ClassDef> = {
  titan: {
    id: 'titan',
    name: 'Tytan',
    description: 'Potężne, wolne ciosy dwuręczną bronią.',
    modelId: 'hero',
    base: {
      maxHp: 140,
      attack: 14,
      defense: 6,
      attackInterval: 1.6,
      critChance: 0.08,
      critMultiplier: 1.8,
    },
    perLevel: { maxHp: 14, attack: 2.2, defense: 0.9 },
  },
  knight: {
    id: 'knight',
    name: 'Rycerz',
    description: 'Miecz i tarcza — najwięcej zdrowia i obrony.',
    modelId: 'hero',
    base: {
      maxHp: 160,
      attack: 11,
      defense: 9,
      attackInterval: 1.3,
      critChance: 0.05,
      critMultiplier: 1.5,
    },
    perLevel: { maxHp: 16, attack: 1.7, defense: 1.3 },
  },
  healer: {
    id: 'healer',
    name: 'Uzdrowiciel',
    description: 'Szybkie, lżejsze ataki i wsparcie.',
    modelId: 'hero',
    base: {
      maxHp: 110,
      attack: 9,
      defense: 5,
      attackInterval: 1.2,
      critChance: 0.05,
      critMultiplier: 1.5,
    },
    perLevel: { maxHp: 11, attack: 1.4, defense: 0.8 },
  },
  mage: {
    id: 'mage',
    name: 'Mag',
    description: 'Najwyższy atak i krytyki, ale kruche zdrowie.',
    modelId: 'hero',
    base: {
      maxHp: 95,
      attack: 15,
      defense: 4,
      attackInterval: 1.5,
      critChance: 0.1,
      critMultiplier: 1.7,
    },
    perLevel: { maxHp: 9.5, attack: 2.4, defense: 0.6 },
  },
}
