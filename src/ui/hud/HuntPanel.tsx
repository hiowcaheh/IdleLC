import { useState } from 'react'
import { getMonster } from '../../game/data/monsters.ts'
import { ZONES } from '../../game/data/zones.ts'
import { openSpotCount, zoneSpots } from '../../game/logic/spots.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ExpeditionDialog } from '../expedition/ExpeditionDialog.tsx'
import { AppraiserPanel } from '../gear/AppraiserPanel.tsx'
import { fmt } from '../gear/format.ts'
import { ShopPanel } from '../gear/ShopPanel.tsx'
import { levelTone } from './levelColor.ts'
import { MonsterBookPanel } from './MonsterBookPanel.tsx'
import { WorldMapPanel } from './WorldMapPanel.tsx'

/**
 * The zone (tap: world map) and its hunting spot: arrows go to the previous spot or to the next one
 * once the current spot's monster has been defeated. Shop, Appraiser, monster book and expedition.
 */
export function HuntPanel() {
  const character = useGameStore((s) => s.character)
  const selectMonster = useGameStore((s) => s.selectMonster)
  const [expeditionOpen, setExpeditionOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [appraiserOpen, setAppraiserOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  if (!character) return null
  const { zoneId, monsterId } = character.location
  const zone = ZONES[zoneId]
  if (!zone) return null

  const spots = zoneSpots(zoneId)
  const index = spots.indexOf(monsterId)
  const open = openSpotCount(character, zoneId)
  const monster = getMonster(monsterId)
  const previous = index > 0 ? spots[index - 1] : undefined
  const next = index + 1 < spots.length ? spots[index + 1] : undefined
  const nextOpen = next !== undefined && index + 1 < open
  const away = character.expedition !== null
  const kills = character.stats.monsterKills[monsterId] ?? 0

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
          Spot{' '}
          <strong>
            {index + 1} / {spots.length}
          </strong>
        </p>
      </header>

      <div className="hunt__spot">
        <button
          type="button"
          className="hunt__arrow"
          aria-label={previous ? `Previous spot: ${getMonster(previous).name}` : 'Previous spot'}
          disabled={!previous || away}
          onClick={() => previous && selectMonster(previous)}
        >
          ‹
        </button>
        <div className="hunt__spot-info" aria-live="polite">
          <span className="hunt__spot-name">
            <span className={`level-tag level-tag--${levelTone(character.level, monster.level)}`}>
              {monster.level}
            </span>
            {monster.name}
          </span>
          <span className="hunt__spot-meta">
            {fmt(kills)} {kills === 1 ? 'kill' : 'kills'}
            {next &&
              (nextOpen
                ? ` · next: ${getMonster(next).name}`
                : ` · defeat one to open ${getMonster(next).name}`)}
          </span>
        </div>
        <button
          type="button"
          className={`hunt__arrow${next && !nextOpen ? ' is-locked' : ''}`}
          aria-label={
            next
              ? nextOpen
                ? `Next spot: ${getMonster(next).name}`
                : `Next spot locked: defeat ${monster.name} first`
              : 'Next spot'
          }
          disabled={!nextOpen || away}
          onClick={() => next && selectMonster(next)}
        >
          {next && !nextOpen ? <LockIcon /> : '›'}
        </button>
      </div>

      <div className="hunt__actions">
        <button type="button" className="hunt__shop" onClick={() => setShopOpen(true)}>
          Shop
        </button>
        <button type="button" className="hunt__shop" onClick={() => setAppraiserOpen(true)}>
          Appraiser
        </button>
        <button type="button" className="hunt__shop" onClick={() => setBookOpen(true)}>
          Book
        </button>
        <button type="button" className="hunt__expedition" onClick={() => setExpeditionOpen(true)}>
          Expedition
        </button>
      </div>
      {shopOpen && <ShopPanel onClose={() => setShopOpen(false)} />}
      {appraiserOpen && <AppraiserPanel onClose={() => setAppraiserOpen(false)} />}
      {bookOpen && <MonsterBookPanel onClose={() => setBookOpen(false)} />}
      {mapOpen && <WorldMapPanel onClose={() => setMapOpen(false)} />}
      {expeditionOpen && (
        <ExpeditionDialog character={character} onClose={() => setExpeditionOpen(false)} />
      )}
    </section>
  )
}

function LockIcon() {
  return (
    <svg className="hunt__lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
