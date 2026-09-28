// Fails the build when a bundle outgrows its budget (gzipped kB).
// The interface paints first, so it gets the tightest budget.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Effects is ambient occlusion plus SMAA, whose lookup texture ships inside
// postprocessing as a data URL (about 53 kB of it). It loads after the scene
// is interactive, and only when the quality level uses it.
const BUDGET = { index: 90, Scene: 230, 'three.core': 105, Effects: 160, worker: 8 }
const OTHER = 40 // any other lazy chunk, such as the glTF loader
const dir = 'dist/assets'
let failed = false

for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const name = file.split('-')[0]
  const kb = gzipSync(readFileSync(join(dir, file)), { level: 9 }).length / 1000
  const limit = BUDGET[name] ?? OTHER
  const over = limit !== undefined && kb > limit
  failed ||= over
  console.log(`${over ? 'OVER' : 'ok  '}  ${name.padEnd(8)} ${kb.toFixed(1).padStart(6)} kB${limit ? ` / ${limit} kB` : ''}`)
}

if (failed) {
  console.error('A bundle is over budget.')
  process.exit(1)
}
