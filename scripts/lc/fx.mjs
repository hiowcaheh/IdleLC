/**
 * Effect textures from the client (`Data\Effect\Texture`, `Data\Effect\Particle`) for the skill
 * effects of the game (src/scene/SkillEffects.tsx): magic circles, shock waves, flashes, sparks.
 * The effect definitions themselves (Effect.dat) are encrypted in the Nemesis client, so the game
 * puts these pieces together by skill kind. Drawn with additive blending: black is transparent.
 */
import sharp from 'sharp'
import { parseTexture } from './texture.mjs'

const tex = (folder, name) => `Data\\Effect\\${folder}\\${name}.tex`

/** name → client texture. */
export const FX_TEXTURES = {
  'magic-circle': tex('Texture', 'HL_CL_MagicCircle'),
  shockwave: tex('Texture', 'GG_ShkWav'),
  ring: tex('Particle', 'boom_ring'),
  explosion: tex('Particle', 'TI_SSK01_RedExplosion'),
  flash: tex('Particle', 'LH_spotlight_center_01'),
  glow: tex('Texture', 'Glow2'),
  burst: tex('Texture', 'CircularFx01'),
  heal: tex('Texture', 'Heal_Magic'),
  star: tex('Particle', 'Star'),
  'spark-red': tex('Particle', 'FX_p_red'),
  'spark-blue': tex('Particle', 'FX_p_blue'),
  'spark-yellow': tex('Particle', 'FX_p_yellow'),
}

/** Longest side of an effect texture (they are small on screen). */
const MAX_SIZE = 256

/** The textures as WebP images: { name: Buffer }; missing or unreadable ones are left out. */
export async function buildFxTextures(files) {
  const out = {}
  for (const [name, path] of Object.entries(FX_TEXTURES)) {
    if (!files.resolve(path)) continue
    let texture
    try {
      texture = parseTexture(files.read(path))
    } catch {
      continue // stored encrypted
    }
    let image = sharp(Buffer.from(texture.rgba), {
      raw: { width: texture.width, height: texture.height, channels: 4 },
    })
    if (Math.max(texture.width, texture.height) > MAX_SIZE) {
      image = image.resize({ width: MAX_SIZE, height: MAX_SIZE, fit: 'inside' })
    }
    out[name] = await image.webp({ quality: 88, alphaQuality: 90 }).toBuffer()
  }
  return out
}
