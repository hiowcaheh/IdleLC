import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App.tsx'
import './index.css'
import { lockZoom } from './ui/lockZoom.ts'

lockZoom()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Installable app: the service worker caches the game for fast (and offline) starts. Production only —
// in development it would serve stale modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        // files loaded before the worker took over (first visit) are cached now
        const urls = performance.getEntriesByType('resource').map((entry) => entry.name)
        registration.active?.postMessage({ type: 'cache-loaded', urls })
      })
      .catch(() => undefined)
  })
}
