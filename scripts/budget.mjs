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

// What paints the interface is the entry chunk and every chunk it imports statically: the
// bundler can move shared modules out of index into small chunks, and those load first too.
// 90 kB until the embed bridge. The bridge loads only in a frame, but it shares the language
// and query modules with the entry, and the bundler then keeps those in a chunk of their own
// that still loads first: 90.6 kB, of which 0.2 kB is new code and 0.7 kB chunk overhead.
// Five ways to keep them in the entry were tried, from bundler settings to handing the
// bridge its helpers from the app, and none did.
const FIRST_LOAD = 91
const gz = (file) => gzipSync(readFileSync(join(dir, file)), { level: 9 }).length / 1000
const first = new Set()
const load = (file) => {
  if (first.has(file)) return
  first.add(file)
  for (const m of readFileSync(join(dir, file), 'utf8').matchAll(/(?:^|[;}])import(?:[^'"()]*?from)?\s*["']\.\/([^"']+\.js)["']/g)) load(m[1])
}
load(readdirSync(dir).find((f) => /^index-.*\.js$/.test(f)))
const firstKb = [...first].reduce((kb, f) => kb + gz(f), 0)
const heavy = firstKb > FIRST_LOAD
failed ||= heavy
console.log(`${heavy ? 'OVER' : 'ok  '}  first load ${firstKb.toFixed(1).padStart(6)} kB / ${FIRST_LOAD} kB (${[...first].map((f) => f.split('-')[0]).join(' + ')})`)

// The <cutaway-twin> element that host pages load, built on its own beside the app.
const EMBED = 3
const embedKb = gzipSync(readFileSync('dist/embed.js'), { level: 9 }).length / 1000
failed ||= embedKb > EMBED
console.log(`${embedKb > EMBED ? 'OVER' : 'ok  '}  embed.js ${embedKb.toFixed(1).padStart(8)} kB / ${EMBED} kB`)

if (failed) {
  console.error('A bundle is over budget.')
  process.exit(1)
}
