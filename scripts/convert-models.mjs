#!/usr/bin/env node
/**
 * Converts source models into optimized GLB files for the game.
 *
 *   npm run convert-models                       # assets-src/ -> public/assets-local/models/
 *   npm run convert-models -- <in> --out <dir>   # custom input (file or folder) and output
 *
 * - .glb / .gltf are optimized directly with gltf-transform
 *   (dedup, prune, weld, animation resample, meshopt compression).
 * - .fbx / .obj / .dae are first exported to glTF with Blender in headless mode,
 *   if Blender is available (on PATH or via the BLENDER env var).
 *
 * Output goes to a git-ignored folder by default: private source assets must never be committed
 * (the repository is public). Only CC0 assets belong in public/models/.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GLTF_EXT = new Set(['.glb', '.gltf'])
const BLENDER_EXT = new Set(['.fbx', '.obj', '.dae'])

function parseArgs(argv) {
  const args = { input: join(ROOT, 'assets-src'), out: join(ROOT, 'public/assets-local/models') }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = resolve(argv[++i])
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true
    else args.input = resolve(argv[i])
  }
  return args
}

function listFiles(path) {
  if (!existsSync(path)) return []
  if (statSync(path).isFile()) return [path]
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name)
    return entry.isDirectory() ? listFiles(full) : [full]
  })
}

function findBlender() {
  const candidates = [process.env.BLENDER, 'blender'].filter(Boolean)
  for (const bin of candidates) {
    const result = spawnSync(bin, ['--version'], { stdio: 'ignore' })
    if (result.status === 0) return bin
  }
  return null
}

function exportWithBlender(blender, file, tmpDir) {
  const outFile = join(tmpDir, `${basename(file, extname(file))}.glb`)
  const script = join(ROOT, 'scripts/blender-export-gltf.py')
  const result = spawnSync(blender, ['--background', '--python', script, '--', file, outFile], {
    stdio: 'inherit',
  })
  if (result.status !== 0 || !existsSync(outFile)) throw new Error(`Blender export failed: ${file}`)
  return outFile
}

async function optimize(io, inFile, outFile) {
  const document = await io.read(inFile)
  await document.transform(
    dedup(),
    prune(),
    weld(),
    resample(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  mkdirSync(dirname(outFile), { recursive: true })
  await io.write(outFile, document)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Usage: npm run convert-models -- [input file or folder] [--out <dir>]')
    return
  }

  const baseDir = statSync(args.input, { throwIfNoEntry: false })?.isFile()
    ? dirname(args.input)
    : args.input
  const files = listFiles(args.input)
  if (files.length === 0) {
    console.log(`No files found in ${relative(ROOT, args.input) || args.input}`)
    return
  }

  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  })

  const blender = findBlender()
  const tmpDir = mkdtempSync(join(tmpdir(), 'idlelc-convert-'))
  let converted = 0
  let skipped = 0

  try {
    for (const file of files) {
      const ext = extname(file).toLowerCase()
      const rel = relative(baseDir, file)
      const outFile = join(args.out, rel.slice(0, -ext.length) + '.glb')

      if (!GLTF_EXT.has(ext) && !BLENDER_EXT.has(ext)) continue
      if (BLENDER_EXT.has(ext) && !blender) {
        console.warn(`skip  ${rel}  (needs Blender: install it or set BLENDER=/path/to/blender)`)
        skipped++
        continue
      }

      try {
        const source = BLENDER_EXT.has(ext) ? exportWithBlender(blender, file, tmpDir) : file
        await optimize(io, source, outFile)
        const before = statSync(file).size
        const after = statSync(outFile).size
        console.log(
          `ok    ${rel}  ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`,
        )
        converted++
      } catch (error) {
        console.error(`fail  ${rel}  ${error instanceof Error ? error.message : error}`)
        skipped++
      }
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log(`\nDone: ${converted} converted, ${skipped} skipped -> ${relative(ROOT, args.out)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
