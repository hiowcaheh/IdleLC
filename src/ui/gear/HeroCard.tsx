import { useMemo } from 'react'
import { CLASSES } from '../../game/data/classes.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { expToNextLevel } from '../../game/logic/progression.ts'
import { ClassPreview } from '../characters/ClassPreview.tsx'
import { Bar } from '../hud/Bar.tsx'
import { formatSp } from '../skills/format.ts'
import { fmt } from './format.ts'

/**
 * The top of the Character window: the hero turning on a pedestal in its worn gear, its name, class
 * and level, the experience to the next level, skill points and gold.
 */
export function HeroCard({ character }: { character: CharacterData }) {
  const { level, exp, sp, gold, equipment } = character
  const worn = useMemo(() => Object.values(equipment).map((piece) => piece.itemId), [equipment])
  const needed = expToNextLevel(level)
  const share = needed > 0 ? (exp / needed) * 100 : 100

  return (
    <header className="hero-card">
      <div className="hero-card__preview">
        <ClassPreview classId={character.classId} items={worn} />
      </div>
      <div className="hero-card__info">
        <h3 className="hero-card__name">{character.name}</h3>
        <p className="hero-card__class">
          {CLASSES[character.classId].name} · Level {level}
        </p>
        <div className="hero-card__exp">
          <Bar
            value={Math.floor(share)}
            max={100}
            variant="exp"
            label="Experience"
            text={needed > 0 ? `${share.toFixed(2)}%` : 'Max level'}
          />
          {needed > 0 && (
            <span className="hero-card__exp-numbers">
              {fmt(exp)} / {fmt(needed)} EXP
            </span>
          )}
        </div>
        <dl className="hero-stats hero-stats--single hero-card__stats">
          <div>
            <dt>Skill points</dt>
            <dd>{formatSp(sp)}</dd>
          </div>
          <div>
            <dt>Gold</dt>
            <dd>
              <span className="coin coin--small" aria-hidden="true" /> {fmt(gold)}
            </dd>
          </div>
        </dl>
      </div>
    </header>
  )
}
