import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

/**
  Visit with ?stats for a frame meter: frame rate while the scene is
  moving, and draw calls and triangles for the last rendered frame.
  With on-demand rendering an idle scene draws nothing, so the rate is
  measured only across consecutive frames.
*/
export function FrameMeter() {
  const gl = useThree((s) => s.gl)
  const el = useRef<HTMLDivElement | null>(null)
  const last = useRef(0)
  const times = useRef<number[]>([])
  const shown = useRef(0)

  useEffect(() => {
    const d = document.createElement('div')
    d.className = 'meter'
    d.setAttribute('aria-hidden', 'true')
    document.querySelector('.stage')?.append(d)
    el.current = d
    gl.info.autoReset = false
    return () => {
      d.remove()
      gl.info.autoReset = true
    }
  }, [gl])

  // ?stats=orbit keeps the camera turning, so the meter reads a sustained frame rate.
  const orbit = new URLSearchParams(location.search).get('stats') === 'orbit'
  const controls = useThree((s) => s.controls) as { azimuthAngle: number; rotate: (a: number, p: number, t: boolean) => void } | null
  const invalidate = useThree((s) => s.invalidate)

  useFrame((_, delta) => {
    if (orbit && controls) {
      controls.rotate(delta * 0.25, 0, false)
      invalidate()
    }
    const now = performance.now()
    const dt = now - last.current
    last.current = now
    if (dt < 100) times.current.push(dt)
    if (times.current.length > 60) times.current.shift()
    gl.info.reset()
    // Read after this frame's render calls, the composer's included.
    queueMicrotask(() => {
      if (!el.current || now - shown.current < 250) return
      shown.current = now
      const avg = times.current.reduce((a, b) => a + b, 0) / Math.max(1, times.current.length)
      const fps = times.current.length > 5 ? Math.round(1000 / avg) : 0
      const { calls, triangles } = gl.info.render
      const tris = Number.isFinite(triangles) ? `${(triangles / 1000).toFixed(1)}k` : '…'
      el.current.textContent = `${fps ? `${fps} fps` : 'idle'} · ${calls} draw calls · ${tris} triangles`
    })
  }, -1)

  return null
}
