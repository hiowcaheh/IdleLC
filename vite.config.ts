/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// GitHub Pages serves the project from https://<user>.github.io/IdleLC/
export default defineConfig({
  base: '/IdleLC/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    // three.js (~0.7 MB) is the largest chunk; expected for a 3D game
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        // libraries and game data change less often than the game code: separate files stay
        // cached (service worker, browser) across deploys
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            {
              name: 'react-three',
              test: /node_modules[\\/](@react-three|three-stdlib|@monogrid|troika)/,
            },
            { name: 'vendor', test: /node_modules/ },
            { name: 'lc-data', test: /src[\\/]game[\\/]data[\\/]generated/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    // tests always run on the placeholder data, even when local LC data exists
    env: { VITE_LC_DATA: '0' },
  },
})
