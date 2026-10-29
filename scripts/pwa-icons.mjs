#!/usr/bin/env node
/**
 * Renders the IdleLC app icons (own artwork, no LC graphics) for the web app manifest:
 *   npm run pwa-icons  →  public/pwa/icon-{192,512}.png, maskable-512.png, apple-touch-icon.png
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/pwa')

/** The gilt star of the favicon on dark leather; `inset` leaves room for maskable crops. */
function iconSvg(inset) {
  const s = 512
  const c = s / 2
  const r = (s / 2) * (1 - inset) * 0.86
  const star = (k) =>
    [0, 1, 2, 3, 4, 5, 6, 7]
      .map((i) => {
        const a = (Math.PI / 4) * i - Math.PI / 2
        const d = i % 2 === 0 ? r * k : r * k * 0.3
        return `${(c + Math.cos(a) * d).toFixed(1)},${(c + Math.sin(a) * d).toFixed(1)}`
      })
      .join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="70%">
      <stop offset="0" stop-color="#3a2b1f"/><stop offset="1" stop-color="#0d0b10"/>
    </radialGradient>
    <linearGradient id="gilt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff1b8"/><stop offset="0.5" stop-color="#e2b864"/>
      <stop offset="1" stop-color="#8a6a3a"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <circle cx="${c}" cy="${c}" r="${(r * 0.62).toFixed(1)}" fill="none" stroke="#8a6a3a" stroke-width="${(r * 0.035).toFixed(1)}"/>
  <polygon points="${star(1)}" fill="url(#gilt)" stroke="#4a3418" stroke-width="${(r * 0.02).toFixed(1)}"/>
  <circle cx="${c}" cy="${c}" r="${(r * 0.13).toFixed(1)}" fill="#0d0b10" stroke="#f6d98e" stroke-width="${(r * 0.025).toFixed(1)}"/>
</svg>`
}

async function render(file, size, inset) {
  await sharp(Buffer.from(iconSvg(inset)))
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, file))
  console.log(`${file} ${size}×${size}`)
}

fs.mkdirSync(OUT, { recursive: true })
await render('icon-192.png', 192, 0.02)
await render('icon-512.png', 512, 0.02)
await render('maskable-512.png', 512, 0.2)
await render('apple-touch-icon.png', 180, 0.06)
