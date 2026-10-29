import { useMemo, useState } from 'react'
import { skillsForClass } from '../game/data/skills.ts'
import { checkLearn } from '../game/logic/skills.ts'
import { useGameStore } from '../state/gameStore.ts'
import { GameCanvas } from '../scene/GameCanvas.tsx'
import { AfkSummary } from './AfkSummary.tsx'
import { DevPanel } from './dev/DevPanel.tsx'
import { ExpeditionPanel } from './expedition/ExpeditionPanel.tsx'
import { useDevTools } from './dev/devMode.ts'
import { ExpBar } from './hud/ExpBar.tsx'
import { HuntPanel } from './hud/HuntPanel.tsx'
import { LevelUpBanner } from './hud/LevelUpBanner.tsx'
import { PlayerFrame } from './hud/PlayerFrame.tsx'
import { StatusLine } from './hud/StatusLine.tsx'
import { TargetFrame } from './hud/TargetFrame.tsx'
import { InventoryPanel } from './items/InventoryPanel.tsx'
import { LoadingOverlay } from './LoadingOverlay.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { SkillBar } from './skills/SkillBar.tsx'
import { SkillsPanel } from './skills/SkillsPanel.tsx'

export function GameScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
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

      <div className="hud">
        <div className="hud__top">
          <PlayerFrame />
          <div className="hud__buttons">
            <button
              type="button"
              className="icon-button hud__settings"
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
              className="icon-button"
              onClick={() => setInventoryOpen(true)}
              aria-label="Inventory"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 8 V6.5 a4 4 0 0 1 8 0 V8 M5 8 H19 L18 20 H6 Z M9.5 12 H14.5" />
              </svg>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSkillsOpen(true)}
              aria-label={learnable > 0 ? `Skills (${learnable} to learn)` : 'Skills'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 6.5 C10 5 7 4.5 4 5 V18.5 C7 18 10 18.5 12 20 C14 18.5 17 18 20 18.5 V5 C17 4.5 14 5 12 6.5 Z M12 6.5 V20" />
              </svg>
              {learnable > 0 && <span className="icon-button__badge">{learnable}</span>}
            </button>
          </div>
        </div>
        <div className="hud__center">
          {!expedition && <TargetFrame />}
          {!expedition && <StatusLine />}
          <LevelUpBanner />
        </div>
        <div className="hud__bottom">
          {character && expedition ? (
            <ExpeditionPanel character={character} expedition={expedition} />
          ) : (
            <div className="hud__dock">
              <SkillBar />
              <HuntPanel />
            </div>
          )}
          {devTools && <DevPanel />}
        </div>
        <div className="hud__exp">
          <ExpBar />
        </div>
      </div>

      <LoadingOverlay />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {inventoryOpen && <InventoryPanel onClose={() => setInventoryOpen(false)} />}
      {skillsOpen && <SkillsPanel onClose={() => setSkillsOpen(false)} />}
      <AfkSummary />
    </div>
  )
}
