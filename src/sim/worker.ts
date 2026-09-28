import { simulate } from './simulate'

// The day is generated off the main thread, so the first frame of the
// scene never waits on the simulation.
self.onmessage = (e: MessageEvent<{ seed: number }>) => {
  const t0 = performance.now()
  const day = simulate(e.data.seed)
  self.postMessage({ day, ms: Math.round(performance.now() - t0) })
}
