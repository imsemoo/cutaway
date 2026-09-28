import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Vector3 } from 'three'
import { anchors, watchAnchors } from './tags'

/** Projects every registered tag's world point to the screen, once per rendered frame. */
export function TagTracker() {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const v = useMemo(() => new Vector3(), [])

  // A tag that appears or moves while the camera is still needs a frame of its own.
  useEffect(() => watchAnchors(() => invalidate()), [invalidate])

  useFrame(({ camera, size }) => {
    if (!anchors.size) return
    const canvas = gl.domElement.getBoundingClientRect()
    const stage = gl.domElement.closest('.stage')?.getBoundingClientRect()
    const dx = stage ? canvas.left - stage.left : 0
    const dy = stage ? canvas.top - stage.top : 0
    for (const a of anchors.values()) {
      v.set(a.x, a.y, a.z).project(camera)
      if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) {
        a.el.style.visibility = 'hidden'
        continue
      }
      const x = ((v.x + 1) / 2) * size.width + dx
      const y = ((1 - v.y) / 2) * size.height + dy
      a.el.style.visibility = 'visible'
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
    }
  })

  return null
}
