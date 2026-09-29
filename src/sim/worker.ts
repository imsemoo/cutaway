import { WING_BY_CODE } from '../data/floorplan'
import { simulate } from './simulate'

/*
  The day is generated off the main thread, so the first frame of the scene
  never waits on the simulation. The wing the page opens on comes first, in
  under 30 ms; the whole hospital follows, in under a second.
*/
self.onmessage = (e: MessageEvent<{ seed: number; first?: string }>) => {
  const t0 = performance.now()
  const first = e.data.first && WING_BY_CODE[e.data.first]
  if (first) self.postMessage({ day: simulate(e.data.seed, [first]), ms: Math.round(performance.now() - t0), complete: false })
  self.postMessage({ day: simulate(e.data.seed), ms: Math.round(performance.now() - t0), complete: true })
}
