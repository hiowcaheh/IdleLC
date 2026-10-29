import { useEffect, useRef, useState } from 'react'
import type { GraphicsQuality } from '../game/logic/save.ts'
import { useGameStore } from '../state/gameStore.ts'
import { useDevTools } from './dev/devMode.ts'

const QUALITY_OPTIONS: { value: GraphicsQuality; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Adapts to your device' },
  { value: 'low', label: 'Low', hint: 'No shadows, for older phones' },
  { value: 'high', label: 'High', hint: 'Full resolution and shadows' },
]

export function SettingsPanel({ onClose }: { onClose(): void }) {
  const settings = useGameStore((s) => s.save.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const resetSave = useGameStore((s) => s.resetSave)
  const devTools = useDevTools((s) => s.enabled)
  const setDevTools = useDevTools((s) => s.setEnabled)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialog.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!confirmReset) return
    const timer = setTimeout(() => setConfirmReset(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmReset])

  const onReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      return
    }
    resetSave()
    setConfirmReset(false)
    setResetDone(true)
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet__header">
          <h2 id="settings-title" className="sheet__title">
            Settings
          </h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" />
            </svg>
          </button>
        </header>

        <fieldset className="setting">
          <legend className="setting__label">Graphics quality</legend>
          <div className="segmented">
            {QUALITY_OPTIONS.map((o) => (
              <label key={o.value} className="segmented__option">
                <input
                  type="radio"
                  name="quality"
                  value={o.value}
                  checked={settings.quality === o.value}
                  onChange={() => updateSettings({ quality: o.value })}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <p className="setting__hint">
            {QUALITY_OPTIONS.find((o) => o.value === settings.quality)?.hint}
          </p>
        </fieldset>

        <label className="setting setting--row">
          <span className="setting__label">Damage numbers</span>
          <input
            type="checkbox"
            className="switch"
            checked={settings.showDamageNumbers}
            onChange={(e) => updateSettings({ showDamageNumbers: e.target.checked })}
          />
        </label>

        <label className="setting setting--row">
          <span>
            <span className="setting__label">Developer tools</span>
            <span className="setting__hint">Game speed, level and any monster — for testing</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={devTools}
            onChange={(e) => setDevTools(e.target.checked)}
          />
        </label>

        <div className="setting setting--danger">
          <span className="setting__label">Saved game</span>
          <p className="setting__hint">
            {resetDone
              ? 'Save deleted. You are starting over.'
              : 'Your progress is saved in this browser.'}
          </p>
          <button
            type="button"
            className={`button button--danger${confirmReset ? ' is-armed' : ''}`}
            onClick={onReset}
          >
            {confirmReset ? 'Are you sure? Tap again to delete' : 'Reset save'}
          </button>
        </div>

        <p className="sheet__version">IdleLC {__APP_VERSION__}</p>
      </div>
    </div>
  )
}
