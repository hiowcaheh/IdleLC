import { Gold } from '../Gold.tsx'
import { useEffect, useMemo, useState } from 'react'
import { CLASSES } from '../../game/data/classes.ts'
import type { CharacterData } from '../../game/logic/character.ts'
import { expToNextLevel } from '../../game/logic/progression.ts'
import { wornTitle } from '../../game/logic/titles.ts'
import { armorUpgradePlus } from '../../scene/upgradeEffects.ts'
import { ClassPreview } from '../characters/ClassPreview.tsx'
import { Bar } from '../hud/Bar.tsx'
import { formatSp } from '../skills/format.ts'
import { titleStyle } from '../titles/format.ts'
import { fmt } from './format.ts'

/**
 * The top of the Character window: the hero turning on a pedestal in its worn gear, its name (worn
 * title under it), class
 * and level, the experience to the next level, skill points and gold.
 */
export function HeroCard({ character }: { character: CharacterData }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const { level, exp, sp, gold, equipment } = character
  const worn = useMemo(() => Object.values(equipment).map((piece) => piece.itemId), [equipment])
  const needed = expToNextLevel(level)
  const share = needed > 0 ? (exp / needed) * 100 : 100
  const title = wornTitle(character, now)

  return (
    <header className="hero-card">
      <div className="hero-card__preview">
        <ClassPreview
          classId={character.classId}
          items={worn}
          weaponPlus={equipment.weapon?.plus ?? 0}
          armorPlus={armorUpgradePlus(equipment)}
          titleEffect={title?.effect}
        />
      </div>
      <div className="hero-card__info">
        <h3 className="hero-card__name">{character.name}</h3>
        {title && (
          <p className="hero-card__title" style={titleStyle(title)}>
            {title.name}
          </p>
        )}
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
            <dd>
              <span className="sp-value">
                <span className="sp-icon" aria-hidden="true" />
                {formatSp(sp)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Gold</dt>
            <dd>
              <Gold amount={gold} />
            </dd>
          </div>
        </dl>
      </div>
    </header>
  )
}
