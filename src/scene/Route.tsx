import { Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { ACCENT } from '../lib/colors'
import { useWard } from '../state/store'
import { ringGeometry } from './geometry'
import { levelY } from './layout'

const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** How long the dashes run along the route before it settles, so a route on show does not keep the GPU busy. */
const FLOW = 8

/** The way to the nearest free piece of equipment, drawn on the floors it crosses, with a ring where it stands. */
export function Route() {
  const route = useWard((s) => s.route)
  const line = useRef<Line2>(null)
  const since = useRef(0)
  const invalidate = useThree((s) => s.invalidate)
  const ring = useMemo(ringGeometry, [])
  const points = useMemo(() => route?.points.map((p) => [p.x, levelY(p.level) + 0.2, p.z] as [number, number, number]) ?? [], [route])

  useEffect(() => {
    since.current = 0
    // Drawn over the walls, like the line on a wayfinding map, so no corridor hides any of it.
    if (line.current) line.current.renderOrder = 10
    invalidate()
  }, [route, invalidate])

  useFrame((_, dt) => {
    const l = line.current
    if (!l || reduced || since.current > FLOW) return
    since.current += dt
    l.material.dashOffset -= dt * 2.2
    invalidate()
  })

  if (!route || points.length < 2) return null
  const end = points[points.length - 1]
  return (
    <group>
      <Line ref={line} points={points} color={ACCENT} lineWidth={4} dashed dashSize={1.1} gapSize={0.7} depthTest={false} />
      <mesh geometry={ring} position={[end[0], end[1] - 0.1, end[2]]} scale={1.4} renderOrder={10}>
        <meshBasicMaterial color={ACCENT} depthTest={false} />
      </mesh>
    </group>
  )
}
