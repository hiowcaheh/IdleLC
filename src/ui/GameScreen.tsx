import { useMemo, useState } from 'react'
import { skillsForClass } from '../game/data/skills.ts'
import { checkLearn } from '../game/logic/skills.ts'
import { useGameStore } from '../state/gameStore.ts'
import { GameCanvas } from '../scene/GameCanvas.tsx'
import { RewardFeed } from './hud/RewardFeed.tsx'
import { SceneLabels } from './hud/SceneLabels.tsx'
import { AfkSummary } from './AfkSummary.tsx'
import { DevPanel } from './dev/DevPanel.tsx'
import { ExpeditionPanel } from './expedition/ExpeditionPanel.tsx'
import { useDevTools } from './dev/devMode.ts'
import { HuntPanel } from './hud/HuntPanel.tsx'
import { PotionSlots } from './hud/PotionSlots.tsx'
import { LevelUpBanner } from './hud/LevelUpBanner.tsx'
import { PlayerFrame } from './hud/PlayerFrame.tsx'
import { StatusLine } from './hud/StatusLine.tsx'
import { InventoryPanel } from './items/InventoryPanel.tsx'
import { LoadingOverlay } from './LoadingOverlay.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { CharacterPanel } from './gear/CharacterPanel.tsx'
import { SkillBar } from './skills/SkillBar.tsx'
import { SkillsPanel } from './skills/SkillsPanel.tsx'
import { TitlesPanel } from './titles/TitlesPanel.tsx'
import { Toasts } from './Toasts.tsx'
import { ZoneLoading } from './ZoneLoading.tsx'

export function GameScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [characterOpen, setCharacterOpen] = useState(false)
  const [titlesOpen, setTitlesOpen] = useState(false)
  const devTools = useDevTools((s) => s.enabled)
  const character = useGameStore((s) => s.character)
  const expedition = character?.expedition ?? null
  const learnable = useMemo(
    () =>
      character && !character.expedition
        ? skillsForClass(character.classId).filter((s) => checkLearn(character, s.id) === null)
            .length
        : 0,
    [character],
  )

  return (
    <div className="game">
      <GameCanvas />
      {character && !character.expedition && <SceneLabels />}
      {character && !character.expedition && <RewardFeed />}

      <div className="hud">
        <div className="hud__top">
          <PlayerFrame />
          <div className="hud__buttons">
            <button
              type="button"
              className="icon-button hud__settings hud__menu hud__menu--system"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
              </svg>
            </button>
            <button
              type="button"
              className="icon-button hud__menu hud__menu--inventory"
              onClick={() => setInventoryOpen(true)}
              aria-label="Inventory"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 8 V6.5 a4 4 0 0 1 8 0 V8 M5 8 H19 L18 20 H6 Z M9.5 12 H14.5" />
              </svg>
            </button>
            <button
              type="button"
              className="icon-button hud__menu hud__menu--skills"
              onClick={() => setSkillsOpen(true)}
              aria-label={learnable > 0 ? `Skills (${learnable} to learn)` : 'Skills'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 6.5 C10 5 7 4.5 4 5 V18.5 C7 18 10 18.5 12 20 C14 18.5 17 18 20 18.5 V5 C17 4.5 14 5 12 6.5 Z M12 6.5 V20" />
              </svg>
              {learnable > 0 && <span className="icon-button__badge">{learnable}</span>}
            </button>
            <button
              type="button"
              className="icon-button hud__menu hud__menu--titles"
              onClick={() => setTitlesOpen(true)}
              aria-label="Titles"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4 H18 V20 H6 Z M9 8 H15 M9 12 H15 M9 16 H13" />
              </svg>
            </button>
            <button
              type="button"
              className="icon-button hud__menu hud__menu--character"
              onClick={() => setCharacterOpen(true)}
              aria-label="Character and gear"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 11 C6 6.5 8.5 4 12 4 C15.5 4 18 6.5 18 11 V15 H14.5 V12 H9.5 V15 H6 Z M8 15 V20 M16 15 V20 M12 12 V20" />
              </svg>
            </button>
          </div>
        </div>
        {!expedition && (
          <div className="hud__side">
            <PotionSlots />
          </div>
        )}
        <div className="hud__center">
          <LevelUpBanner />
        </div>
        <div className="hud__bottom">
          {character && expedition ? (
            <ExpeditionPanel character={character} expedition={expedition} />
          ) : (
            <div className="hud__dock">
              {/* over the skill bar, clear of the names over the fighters */}
              <StatusLine />
              <SkillBar />
              <HuntPanel />
            </div>
          )}
          {devTools && <DevPanel />}
        </div>
      </div>

      <LoadingOverlay />
      <ZoneLoading />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {inventoryOpen && <InventoryPanel onClose={() => setInventoryOpen(false)} />}
      {skillsOpen && <SkillsPanel onClose={() => setSkillsOpen(false)} />}
      {characterOpen && <CharacterPanel onClose={() => setCharacterOpen(false)} />}
      {titlesOpen && <TitlesPanel onClose={() => setTitlesOpen(false)} />}
      <AfkSummary />
      <Toasts />
    </div>
  )
}
