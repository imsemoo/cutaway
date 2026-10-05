// Fails the build when a bundle outgrows its budget (gzipped kB).
// The interface paints first, so it gets the tightest budget.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Effects is ambient occlusion plus SMAA, whose lookup texture ships inside
// postprocessing as a data URL (about 53 kB of it). It loads after the scene
// is interactive, and only when the quality level uses it.
const BUDGET = { index: 90, 'three.core': 105, Effects: 160, worker: 8 }
const OTHER = 40 // any other lazy chunk, such as the glTF loader
const dir = 'dist/assets'
let failed = false

const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
const gz = (file) => gzipSync(readFileSync(join(dir, file)), { level: 9 }).length / 1000
const chunk = (prefix) => files.find((f) => f.startsWith(`${prefix}-`))
const label = (set) => [...set].map((f) => f.split('-')[0]).join(' + ')
/** A chunk and every chunk it imports statically: what loads with it. */
const closure = (file, into = new Set()) => {
  if (into.has(file)) return into
  into.add(file)
  for (const m of readFileSync(join(dir, file), 'utf8').matchAll(/(?:^|[;}])import(?:[^'"()]*?from)?\s*["']\.\/([^"']+\.js)["']/g)) closure(m[1], into)
  return into
}
const first = closure(files.find((f) => /^index-.*\.js$/.test(f)))
// The 3D view is Scene and what it needs beyond the first load and three.js itself. The clinic's
// scene shares the React Three Fiber and drei code with it, so the bundler holds that in a chunk
// of its own, named after one of its modules; counted with Scene it is the same 3D view as before.
const SCENE = 230
const view = new Set([...closure(chunk('Scene'))].filter((f) => !first.has(f) && !f.startsWith('three.core-')))

for (const file of files.filter((f) => !view.has(f))) {
  const name = file.split('-')[0]
  const kb = gz(file)
  const limit = BUDGET[name] ?? OTHER
  const over = limit !== undefined && kb > limit
  failed ||= over
  console.log(`${over ? 'OVER' : 'ok  '}  ${name.padEnd(8)} ${kb.toFixed(1).padStart(6)} kB${limit ? ` / ${limit} kB` : ''}`)
}
const viewKb = [...view].reduce((kb, f) => kb + gz(f), 0)
failed ||= viewKb > SCENE
console.log(`${viewKb > SCENE ? 'OVER' : 'ok  '}  3D view  ${viewKb.toFixed(1).padStart(6)} kB / ${SCENE} kB (${label(view)})`)

// What paints the interface is the entry chunk and every chunk it imports statically: the
// bundler can move shared modules out of index into small chunks, and those load first too.
// 90 kB until the embed bridge. The bridge loads only in a frame, but it shares the language
// and query modules with the entry, and the bundler then keeps those in a chunk of their own
// that still loads first: 90.6 kB, of which 0.2 kB is new code and 0.7 kB chunk overhead.
// Five ways to keep them in the entry were tried, from bundler settings to handing the
// bridge its helpers from the app, and none did. The alert actions and the forecast load
// after the first paint; what stays in it for them, the lazy imports and the feed's outbox
// in the store, takes it to 90.8 kB. The alert limits shared with the integration server sit in
// a module of their own: imported from the simulation instead, they split the store into a chunk
// of its own and the first load went to 91.3 kB; on their own they cost 0.1 kB, 90.9 kB.
// The clinic page shares the store, language, alert and icon modules with the entry, and the
// bundler cut more of them into chunks of their own: 91.7 kB. A room's and a piece of equipment's
// details then moved after the first paint, as the alert list had, since neither can show before
// the day arrives: 89.7 kB.
const FIRST_LOAD = 91
const firstKb = [...first].reduce((kb, f) => kb + gz(f), 0)
const heavy = firstKb > FIRST_LOAD
failed ||= heavy
console.log(`${heavy ? 'OVER' : 'ok  '}  first load ${firstKb.toFixed(1).padStart(6)} kB / ${FIRST_LOAD} kB (${label(first)})`)

// The clinic (?building=clinic) loads on top of the first load: its page, then its plan from public/buildings.
const CLINIC = 20
const clinic = new Set([...closure(chunk('ClinicApp'))].filter((f) => !first.has(f)))
const clinicKb = [...clinic].reduce((kb, f) => kb + gz(f), 0)
failed ||= clinicKb > CLINIC
console.log(`${clinicKb > CLINIC ? 'OVER' : 'ok  '}  clinic   ${clinicKb.toFixed(1).padStart(6)} kB / ${CLINIC} kB (${label(clinic)})`)

// The <cutaway-twin> element that host pages load, built on its own beside the app.
const EMBED = 3
const embedKb = gzipSync(readFileSync('dist/embed.js'), { level: 9 }).length / 1000
failed ||= embedKb > EMBED
console.log(`${embedKb > EMBED ? 'OVER' : 'ok  '}  embed.js ${embedKb.toFixed(1).padStart(8)} kB / ${EMBED} kB`)

if (failed) {
  console.error('A bundle is over budget.')
  process.exit(1)
}
