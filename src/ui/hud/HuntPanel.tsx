import { useEffect, useRef, useState } from 'react'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ExpeditionDialog } from '../expedition/ExpeditionDialog.tsx'
import { AppraiserPanel } from '../gear/AppraiserPanel.tsx'
import { ShopPanel } from '../gear/ShopPanel.tsx'
import { levelTone } from './levelColor.ts'
import { WorldMapPanel } from './WorldMapPanel.tsx'

/** Zone name, the monsters you can hunt here, and the kill count. */
export function HuntPanel() {
  const zoneId = useGameStore((s) => s.character?.location.zoneId ?? '')
  const selected = useGameStore((s) => s.character?.location.monsterId ?? '')
  const kills = useGameStore((s) => s.character?.stats.kills ?? 0)
  const playerLevel = useGameStore((s) => s.character?.level ?? 1)
  const selectMonster = useGameStore((s) => s.selectMonster)
  const character = useGameStore((s) => s.character)
  const zone = ZONES[zoneId]
  const list = useRef<HTMLDivElement>(null)
  const [expeditionOpen, setExpeditionOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [appraiserOpen, setAppraiserOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  // keep the hunted monster visible when it was picked elsewhere (dev tools, zone change)
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('.hunt__target.is-active')
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!zone) return null

  return (
    <section className="hunt" aria-label="Hunting">
      <header className="hunt__header">
        <h2 className="hunt__zone">
          <button
            type="button"
            className="hunt__zone-button"
            aria-label={`${zone.name} — open the world map`}
            onClick={() => setMapOpen(true)}
          >
            {zone.name}
            <span className="hunt__zone-chevron" aria-hidden="true">
              ▾
            </span>
          </button>
        </h2>
        <p className="hunt__kills">
          Kills: <strong>{kills}</strong>
        </p>
        <div className="hunt__actions">
          <button type="button" className="hunt__shop" onClick={() => setShopOpen(true)}>
            Shop
          </button>
          <button type="button" className="hunt__shop" onClick={() => setAppraiserOpen(true)}>
            Appraiser
          </button>
          <button
            type="button"
            className="hunt__expedition"
            onClick={() => setExpeditionOpen(true)}
          >
            Expedition
          </button>
        </div>
      </header>
      <div ref={list} className="hunt__targets" role="radiogroup" aria-label="Choose your target">
        {zone.monsterIds.map((id) => {
          const monster = getMonster(id)
          const active = id === selected
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`hunt__target${active ? ' is-active' : ''}`}
              onClick={() => selectMonster(id)}
            >
              <span className={`level-tag level-tag--${levelTone(playerLevel, monster.level)}`}>
                {monster.level}
              </span>
              <span className="hunt__target-name">{monster.name}</span>
            </button>
          )
        })}
      </div>
      {shopOpen && <ShopPanel onClose={() => setShopOpen(false)} />}
      {appraiserOpen && <AppraiserPanel onClose={() => setAppraiserOpen(false)} />}
      {mapOpen && <WorldMapPanel onClose={() => setMapOpen(false)} />}
      {expeditionOpen && character && (
        <ExpeditionDialog character={character} onClose={() => setExpeditionOpen(false)} />
      )}
    </section>
  )
}
