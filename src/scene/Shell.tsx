import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, type Group, type MeshStandardMaterial } from 'three'
import { FLOOR } from '../data/floorplan'
import { useWard } from '../state/store'
import { buildShell } from './geometry'
import { markShadows } from './shadows'

const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const CUT = 0.06

// Model colours, and the ink they turn into when the shell drops to a plan.
const TONES = {
  walls: [new Color('#fbfbfc'), new Color('#2a3441')],
  low: [new Color('#f2f4f6'), new Color('#6b7785')],
  fixtures: [new Color('#c9d0d8'), new Color('#9aa5b1')],
} as const

/*
  The building shell: walls, glass, lifts, counters. In plan view the
  whole shell sinks to a section cut 15 cm above the floor and the walls
  darken to ink, so the model becomes the architect's drawing without
  swapping scenes.
*/
export function Shell() {
  const shell = useMemo(buildShell, [])
  const group = useRef<Group>(null)
  const mats = {
    walls: useRef<MeshStandardMaterial>(null),
    low: useRef<MeshStandardMaterial>(null),
    fixtures: useRef<MeshStandardMaterial>(null),
  }
  const plan = useWard((s) => s.view === 'plan')
  const invalidate = useThree((s) => s.invalidate)
  const target = plan ? CUT : 1

  useEffect(() => invalidate(), [plan, invalidate])
  const rate = useRef(2.2)
  useEffect(() => () => Object.values(shell).forEach((g) => g.dispose()), [shell])

  useFrame((_, dt) => {
    const g = group.current
    if (!g || g.scale.y === target) return
    const next = reduced ? target : MathUtils.damp(g.scale.y, target, rate.current, Math.min(dt, 0.05))
    g.scale.y = Math.abs(next - target) < 0.002 ? target : next
    // The opening rise is slow; later switches are quick.
    if (g.scale.y === target) rate.current = 7
    markShadows()
    const ink = (1 - g.scale.y) / (1 - CUT)
    for (const key of ['walls', 'low', 'fixtures'] as const) {
      const [model, drawing] = TONES[key]
      mats[key].current?.color.copy(model).lerp(drawing, ink)
    }
    invalidate()
  })

  return (
    <group>
      {/* Building footprint: corridors read as the palest surface. */}
      <mesh position={[FLOOR.w / 2, 0.005, FLOOR.d / 2]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[FLOOR.w, FLOOR.d]} />
        <meshStandardMaterial color="#f8f9fa" roughness={1} />
      </mesh>
      {/* First load starts as the drawing, then the walls rise into the model. */}
      <group ref={group} scale-y={reduced ? 1 : CUT}>
        <mesh geometry={shell.walls} castShadow receiveShadow>
          <meshStandardMaterial ref={mats.walls} color={TONES.walls[0]} roughness={0.92} />
        </mesh>
        <mesh geometry={shell.low} castShadow receiveShadow>
          <meshStandardMaterial ref={mats.low} color={TONES.low[0]} roughness={0.9} />
        </mesh>
        <mesh geometry={shell.fixtures} castShadow receiveShadow>
          <meshStandardMaterial ref={mats.fixtures} color={TONES.fixtures[0]} roughness={0.8} />
        </mesh>
        <mesh geometry={shell.glass} renderOrder={2}>
          <meshStandardMaterial color="#9fc3e0" roughness={0.1} metalness={0.1} transparent opacity={0.32} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}
