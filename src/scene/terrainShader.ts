/** The terrain's splat shader (scene/LcTerrain.tsx). Pure. */

/**
 * The ground colour: each layer laid over the ones before it by its mask, as
 * `ground = mix(ground, layer k, mask k)` in turn. Written as the same sum with each layer's share
 * (its mask times what the layers above leave of it), so a layer whose share is 0 here is not
 * read at all: most of the ground shows two or three of the up to 12 layers. The gradients come from
 * outside the branches (textureGrad), so mip levels and anisotropic filtering stay as before.
 */
export function splatFragment(
  layers: number,
  masks: number,
  maskOf: (k: number) => string,
): string {
  const lines = [
    'vec2 maskUv = vMapPos / uMapSize;',
    ...Array.from({ length: masks }, (_, i) => `vec4 mask${i} = texture2D(uMask${i}, maskUv);`),
    'vec2 gx = dFdx(vMapPos);',
    'vec2 gy = dFdy(vMapPos);',
    'float keep = 1.0;',
  ]
  // from the top layer down: its share, then what it leaves to the layers under it
  for (let k = layers - 1; k >= 1; k--)
    lines.push(`float share${k} = ${maskOf(k)} * keep;`, `keep *= 1.0 - ${maskOf(k)};`)
  lines.push('float share0 = keep;', 'vec3 ground = vec3(0.0);')
  for (let k = 0; k < layers; k++)
    lines.push(
      `if (share${k} > 0.0) ground += share${k} * textureGrad(uLayer${k}, vMapPos / uTile${k}, gx / uTile${k}, gy / uTile${k}).rgb;`,
    )
  lines.push('diffuseColor.rgb *= ground;')
  return lines.join('\n')
}

/**
 * The same shares in plain numbers: `masks[k - 1]` is layer k's mask (layer 0 has none). The ground
 * is the sum of share × colour; a share of 0 skips the layer's texture read in the shader.
 */
export function layerShares(masks: readonly number[]): number[] {
  const shares = new Array<number>(masks.length + 1).fill(0)
  let keep = 1
  for (let k = masks.length; k >= 1; k--) {
    shares[k] = masks[k - 1]! * keep
    keep *= 1 - masks[k - 1]!
  }
  shares[0] = keep
  return shares
}
