import { useState } from 'react'
import { GameCanvas } from '../scene/GameCanvas.tsx'
import { DevPanel } from './dev/DevPanel.tsx'
import { DEV_MODE } from './dev/devMode.ts'
import { HuntPanel } from './hud/HuntPanel.tsx'
import { PlayerFrame } from './hud/PlayerFrame.tsx'
import { StatusLine } from './hud/StatusLine.tsx'
import { TargetFrame } from './hud/TargetFrame.tsx'
import { LoadingOverlay } from './LoadingOverlay.tsx'
import { LoadNotice } from './LoadNotice.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'

export function GameScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="game">
      <GameCanvas />

      <div className="hud">
        <div className="hud__top">
          <PlayerFrame />
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
        </div>
        <div className="hud__center">
          <TargetFrame />
          <StatusLine />
        </div>
        <div className="hud__bottom">
          <HuntPanel />
          {DEV_MODE && <DevPanel />}
        </div>
      </div>

      <LoadNotice />
      <LoadingOverlay />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
