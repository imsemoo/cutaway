import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, MathUtils, Matrix4, type InstancedMesh, type MeshStandardMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CORRIDOR_W, LEVELS, LINKS, PLATE, STOREY, WINGS } from '../data/floorplan'
import { HOSPITAL, scopeLevel, shows, type Scope } from '../state/scope'
import { useWard } from '../state/store'
import { WALL_T, buildShell } from './geometry'
import { RIM, levelY } from './layout'
import { markShadows } from './shadows'

const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const CUT = 0.06

// Model colours, and the ink they turn into when the shell drops to a plan.
const TONES = {
  walls: [new Color('#fbfbfc'), new Color('#2a3441')],
  low: [new Color('#f2f4f6'), new Color('#6b7785')],
  fixtures: [new Color('#c9d0d8'), new Color('#9aa5b1')],
} as const

const m = new Matrix4()
const turn = new Matrix4().makeRotationY(-Math.PI / 2)
/**
  The wings in scope packed into the first instances, each at its place on
  its level with the walls at their current height. The mesh draws only
  those: a wing out of scope costs nothing, not even its vertices.
*/
function placeWings(mesh: InstancedMesh | null, height: number, scope: Scope) {
  if (!mesh) return
  let n = 0
  for (const w of WINGS) {
    if (!shows(scope, w.code)) continue
    m.makeScale(1, height, 1)
    m.setPosition(w.x, levelY(w.level), w.z)
    mesh.setMatrixAt(n++, m)
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/** The links on the levels in scope: none in a wing view, which ends at its own glazed corridor ends. */
function placeLinks(mesh: InstancedMesh | null, height: number, scope: Scope) {
  if (!mesh) return
  let n = 0
  for (const l of LINKS) {
    if (scope !== HOSPITAL && scopeLevel(scope) !== l.level) continue
    // A link is modelled along x; one along z is turned, which swings its width to the west, so it starts a width further east.
    m.makeScale(l.length, height, 1)
    if (l.axis === 'z') m.premultiply(turn)
    m.setPosition(l.axis === 'z' ? l.x + CORRIDOR_W : l.x, levelY(l.level), l.z)
    mesh.setMatrixAt(n++, m)
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

/*
  The building shell: walls, glass, lifts, counters. Every wing is built to
  one plan, so each part is one instanced mesh for the whole tower, placed
  wing by wing and level by level. In plan view the shell sinks to a
  section cut 15 cm above the floor and the walls darken to ink, so the
  model becomes the architect's drawing without swapping scenes.
*/
export function Shell() {
  const shell = useMemo(buildShell, [])
  const walls = useRef<InstancedMesh>(null)
  const low = useRef<InstancedMesh>(null)
  const fixtures = useRef<InstancedMesh>(null)
  const glass = useRef<InstancedMesh>(null)
  const plates = useRef<InstancedMesh>(null)
  const linkFloors = useRef<InstancedMesh>(null)
  const linkGlass = useRef<InstancedMesh>(null)
  // One metre of link, stretched to each gap: a floor, and glass on both sides.
  const link = useMemo(
    () => ({
      floor: new BoxGeometry(1, 0.07, CORRIDOR_W).translate(0.5, 0.035, CORRIDOR_W / 2),
      glass: mergeGeometries([
        new BoxGeometry(1, STOREY.wallHeight, WALL_T).translate(0.5, STOREY.wallHeight / 2, WALL_T / 2),
        new BoxGeometry(1, STOREY.wallHeight, WALL_T).translate(0.5, STOREY.wallHeight / 2, CORRIDOR_W - WALL_T / 2),
      ]),
    }),
    [],
  )
  // In the hospital view each level stands on a plate, so its six wings read as one floor.
  const plate = useMemo(() => new BoxGeometry(PLATE.w + RIM * 2, 0.3, PLATE.d + RIM * 2).translate(PLATE.w / 2, -0.16, PLATE.d / 2), [])
  const mats = {
    walls: useRef<MeshStandardMaterial>(null),
    low: useRef<MeshStandardMaterial>(null),
    fixtures: useRef<MeshStandardMaterial>(null),
  }
  const plan = useWard((s) => s.view === 'plan')
  const scope = useWard((s) => s.scope)
  const invalidate = useThree((s) => s.invalidate)
  // The hospital view lowers the walls to a quarter so every level's floors show between them.
  const target = plan ? CUT : scope === HOSPITAL ? 0.25 : 1
  // How far the walls stand, from the section cut to full height. First load starts as the drawing.
  const rise = useRef(reduced ? 1 : CUT)
  const rate = useRef(2.2)

  useLayoutEffect(() => {
    for (const mesh of [walls, low, fixtures, glass]) placeWings(mesh.current, rise.current, scope)
    placeLinks(linkFloors.current, 1, scope)
    placeLinks(linkGlass.current, rise.current, scope)
    // Plates under the levels on show: all six for the hospital, one for a level, none for a wing.
    const p = plates.current
    if (p) {
      const on = LEVELS.filter((level) => scope === HOSPITAL || scopeLevel(scope) === level)
      on.forEach((level, i) => p.setMatrixAt(i, new Matrix4().makeTranslation(0, levelY(level), 0)))
      p.count = on.length
      p.instanceMatrix.needsUpdate = true
      p.computeBoundingSphere()
    }
    markShadows()
    invalidate()
  }, [scope, invalidate])
  useEffect(() => invalidate(), [plan, invalidate])
  useEffect(
    () => () => {
      Object.values(shell).forEach((g) => g.dispose())
      plate.dispose()
      link.floor.dispose()
      link.glass.dispose()
    },
    [shell, plate, link],
  )

  useFrame((_, dt) => {
    if (rise.current === target) return
    const next = reduced ? target : MathUtils.damp(rise.current, target, rate.current, Math.min(dt, 0.05))
    rise.current = Math.abs(next - target) < 0.002 ? target : next
    // The opening rise is slow; later switches are quick.
    if (rise.current === target) rate.current = 7
    const { scope } = useWard.getState()
    for (const mesh of [walls, low, fixtures, glass]) placeWings(mesh.current, rise.current, scope)
    placeLinks(linkGlass.current, rise.current, scope)
    markShadows()
    const ink = (1 - rise.current) / (1 - CUT)
    for (const key of ['walls', 'low', 'fixtures'] as const) {
      const [model, drawing] = TONES[key]
      mats[key].current?.color.copy(model).lerp(drawing, ink)
    }
    invalidate()
  })

  return (
    <group>
      <instancedMesh ref={plates} args={[plate, undefined, LEVELS.length]} receiveShadow>
        <meshStandardMaterial color="#d9dfe6" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={linkFloors} args={[link.floor, undefined, LINKS.length]} receiveShadow>
        <meshStandardMaterial color="#f8f9fa" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={linkGlass} args={[link.glass, undefined, LINKS.length]} renderOrder={2}>
        <meshStandardMaterial color="#9fc3e0" roughness={0.1} metalness={0.1} transparent opacity={0.32} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={walls} args={[shell.walls, undefined, WINGS.length]} castShadow receiveShadow>
        <meshStandardMaterial ref={mats.walls} color={TONES.walls[0]} roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={low} args={[shell.low, undefined, WINGS.length]} castShadow receiveShadow>
        <meshStandardMaterial ref={mats.low} color={TONES.low[0]} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={fixtures} args={[shell.fixtures, undefined, WINGS.length]} castShadow receiveShadow>
        <meshStandardMaterial ref={mats.fixtures} color={TONES.fixtures[0]} roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={glass} args={[shell.glass, undefined, WINGS.length]} renderOrder={2}>
        <meshStandardMaterial color="#9fc3e0" roughness={0.1} metalness={0.1} transparent opacity={0.32} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
