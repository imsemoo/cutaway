import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, MathUtils, Matrix4, type InstancedMesh } from 'three'
import { ROOM_BY_ID, slotPosition } from '../data/floorplan'
import type { Asset, AssetKind, Day } from '../data/types'
import { ASSET_STATUS } from '../lib/colors'
import { assetAt } from '../lib/query'
import { useWard } from '../state/store'
import { assetGeometry } from './geometry'
import { markShadows } from './shadows'

const KINDS: AssetKind[] = ['pump', 'vent', 'chair', 'xray', 'scanner']

/** Where every asset stands at minute t: grouped by location, one slot each. */
export function assetPositions(day: Day, t: number) {
  const byLoc = new Map<string, Asset[]>()
  for (const a of day.assets) {
    const loc = assetAt(a, t).loc
    byLoc.set(loc, [...(byLoc.get(loc) ?? []), a])
  }
  const out = new Map<string, { x: number; z: number }>()
  for (const [loc, list] of byLoc) {
    const room = ROOM_BY_ID[loc]
    list.sort((a, b) => a.id.localeCompare(b.id)).forEach((a, i) => out.set(a.id, slotPosition(room, i)))
  }
  return out
}

export function Equipment() {
  const day = useWard((s) => s.day)
  if (!day) return null
  return (
    <group>
      {KINDS.map((k) => (
        <Kind key={k} kind={k} list={day.assets.filter((a) => a.kind === k)} />
      ))}
    </group>
  )
}

function Kind({ kind, list }: { kind: AssetKind; list: Asset[] }) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => assetGeometry(kind), [kind])
  const day = useWard((s) => s.day)!
  const t = useWard((s) => s.t)
  const selected = useWard((s) => (s.selection?.type === 'asset' ? s.selection.id : null))
  const select = useWard((s) => s.select)
  const invalidate = useThree((s) => s.invalidate)
  const current = useRef<{ x: number; z: number }[]>([])
  const goal = useRef<{ x: number; z: number }[]>([])
  const turn = useRef<number[]>([])

  useLayoutEffect(() => {
    const pos = assetPositions(day, t)
    goal.current = list.map((a) => pos.get(a.id)!)
    // Face the bed in patient rooms; stand square everywhere else.
    turn.current = list.map((a) => {
      const room = ROOM_BY_ID[assetAt(a, t).loc]
      return room.head === 's' ? Math.PI : 0
    })
    if (current.current.length !== list.length) current.current = goal.current.map((p) => ({ ...p }))
    const c = new Color()
    list.forEach((a, i) => {
      const status = assetAt(a, t).status
      c.set(ASSET_STATUS[status])
      if (selected === a.id) c.set('#2946c7')
      ref.current!.setColorAt(i, c)
    })
    if (ref.current!.instanceColor) ref.current!.instanceColor.needsUpdate = true
    write()
    invalidate()
  }, [day, t, selected, list])

  const m = useMemo(() => new Matrix4(), [])
  function write() {
    const mesh = ref.current
    if (!mesh) return
    current.current.forEach((p, i) => {
      m.makeRotationY(turn.current[i] ?? 0)
      m.setPosition(p.x, 0.07, p.z)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    markShadows()
  }

  // Equipment glides to its new room instead of teleporting.
  useFrame((_, dt) => {
    let moving = false
    const k = Math.min(dt, 0.05)
    current.current.forEach((p, i) => {
      const g = goal.current[i]
      if (!g || (p.x === g.x && p.z === g.z)) return
      p.x = MathUtils.damp(p.x, g.x, 6, k)
      p.z = MathUtils.damp(p.z, g.z, 6, k)
      if (Math.abs(p.x - g.x) < 0.01 && Math.abs(p.z - g.z) < 0.01) {
        p.x = g.x
        p.z = g.z
      }
      moving = true
    })
    if (moving) {
      write()
      invalidate()
    }
  })

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5 || e.instanceId === undefined) return
    e.stopPropagation()
    select({ type: 'asset', id: list[e.instanceId].id })
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
    if (useWard.getState().hover) useWard.getState().setHover(null)
  }

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, list.length]}
      castShadow
      onClick={onClick}
      onPointerMove={onMove}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <meshStandardMaterial roughness={0.55} metalness={0.05} />
    </instancedMesh>
  )
}
