import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PINNED, START, dprFor, useQuality } from '../state/quality'

const SLOW = 45
const SMOOTH = 58
const WINDOW = 60

/**
  Watches frame times while the scene is moving (idle gaps don't count, the
  scene renders on demand) and steps the quality level down after a slow
  window, or back up after three smooth ones. It gives up flipping after four
  changes, so a device on the edge settles instead of oscillating.
*/
export function AdaptiveQuality() {
  const level = useQuality((s) => s.level)
  const setDpr = useThree((s) => s.setDpr)
  const w = useRef({ last: 0, frames: 0, time: 0, smooth: 0, flips: 0 })

  useEffect(() => {
    setDpr(dprFor(level))
  }, [level, setDpr])

  useFrame(() => {
    if (PINNED) return
    const s = w.current
    const now = performance.now()
    const dt = now - s.last
    s.last = now
    if (dt > 100) {
      s.frames = 0
      s.time = 0
      return
    }
    s.frames++
    s.time += dt
    if (s.frames < WINDOW) return
    const fps = (1000 * s.frames) / s.time
    s.frames = 0
    s.time = 0
    const { level, setLevel } = useQuality.getState()
    if (s.flips >= 4) return
    if (fps < SLOW && level > 0) {
      setLevel((level - 1) as typeof level)
      s.smooth = 0
      s.flips++
    } else if (fps > SMOOTH && level < START) {
      if (++s.smooth >= 3) {
        setLevel((level + 1) as typeof level)
        s.smooth = 0
        s.flips++
      }
    } else {
      s.smooth = 0
    }
  })

  return null
}

/**
  A lost WebGL context (a driver reset, a GPU switch, too many tabs) pauses
  the scene with a notice instead of freezing it. When the browser restores
  the context, the canvas is rebuilt from scratch, so no half-restored state
  lingers.
*/
export function ContextWatch() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      e.preventDefault() // asks the browser to restore the context
      useQuality.getState().setLost(true)
    }
    const restored = () => useQuality.getState().rebuild()
    el.addEventListener('webglcontextlost', lost)
    el.addEventListener('webglcontextrestored', restored)
    return () => {
      el.removeEventListener('webglcontextlost', lost)
      el.removeEventListener('webglcontextrestored', restored)
    }
  }, [gl])
  return null
}
