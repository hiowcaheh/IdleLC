/**
 * File access to one or more LC client folders (each containing `Data/`, possibly deeper down).
 * Client paths like `Data\monster\Animals\Fox.bm` are matched case-insensitively; when a path
 * does not exist, a file with the same name anywhere in the client is used instead
 * (the client data is not always where the .smc files say).
 */
import fs from 'node:fs'
import path from 'node:path'

const key = (p) => p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()

/** Index key relative to the `Data/` folder, so a folder holding several client copies works too. */
function dataKey(relative) {
  const k = key(relative)
  const at = k.indexOf('/data/')
  return k.startsWith('data/') || at < 0 ? k : k.slice(at + 1)
}

export class ClientFiles {
  /** @param {string[]} roots client folders; later roots override earlier ones */
  constructor(roots) {
    this.roots = roots
    this.byPath = new Map()
    this.byName = new Map()
    for (const root of roots) this.#index(root, root)
  }

  #index(root, dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) this.#index(root, full)
      else if (entry.isFile()) {
        this.byPath.set(dataKey(path.relative(root, full)), full)
        const name = entry.name.toLowerCase()
        if (!this.byName.has(name)) this.byName.set(name, full)
      }
    }
  }

  get size() {
    return this.byPath.size
  }

  /** Absolute path for a client path, or null. */
  resolve(clientPath) {
    const k = key(clientPath)
    return this.byPath.get(k) ?? this.byName.get(k.split('/').pop()) ?? null
  }

  read(clientPath) {
    const file = this.resolve(clientPath)
    if (!file) throw new Error(`missing client file ${clientPath}`)
    return fs.readFileSync(file)
  }

  /** Client paths (as stored in the index) matching a filter. */
  list(filter = () => true) {
    return [...this.byPath.keys()].filter(filter)
  }
}

/** In-memory file set with the same interface (tests, composites). */
export class MemoryFiles {
  constructor(files) {
    this.files = new Map(Object.entries(files).map(([p, data]) => [key(p), data]))
  }

  resolve(clientPath) {
    return this.files.has(key(clientPath)) ? key(clientPath) : null
  }

  read(clientPath) {
    const data = this.files.get(key(clientPath))
    if (!data) throw new Error(`missing client file ${clientPath}`)
    return data
  }
}
