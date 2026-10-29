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
    // three.js + react-three-fiber are ~1.3 MB unminified-equivalent; expected for a 3D game.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
    // tests always run on the placeholder data, even when local LC data exists
    env: { VITE_LC_DATA: '0' },
  },
})
