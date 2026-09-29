import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import { Color, Matrix4, Vector3, type BufferGeometry, type InstancedMesh, type Material } from 'three'
import { markShadows } from './shadows'

/** What a set of instances looks like right now. Mutate it, then bump `version`. */
export interface InstanceData {
  x: Float32Array
  /** The height of the instance's level. */
  y: Float32Array
  z: Float32Array
  rot: Float32Array
  show: Uint8Array
  color: Color[]
  version: number
}

/** Instance data created once per component, with a first fill. */
export function useInstanceData(n: number, init?: (d: InstanceData) => void) {
  const ref = useRef<InstanceData | null>(null)
  if (!ref.current) {
    ref.current = makeInstanceData(n)
    init?.(ref.current)
  }
  return ref as MutableRefObject<InstanceData>
}

export function makeInstanceData(n: number): InstanceData {
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    z: new Float32Array(n),
    rot: new Float32Array(n),
    show: new Uint8Array(n).fill(1),
    color: Array.from({ length: n }, () => new Color('#ffffff')),
    version: 0,
  }
}

interface Props {
  data: MutableRefObject<InstanceData>
  count: number
  hi: BufferGeometry | null | undefined
  lo: BufferGeometry | null | undefined
  material: Material
  /** Metres from the point the camera looks at, within which an instance uses the detailed model. */
  near: number
  y?: number
  onPick?: (index: number) => void
  onHover?: (e: ThreeEvent<PointerEvent>) => void
  onLeave?: () => void
}

/**
  Per-instance level of detail across two instanced meshes. Each frame the
  camera has moved (or the data changed), every instance is packed into the
  detailed mesh or the proxy mesh by its distance from the point the camera
  looks at, and only when the camera is close. Detail goes where the eye is,
  with a few metres of hysteresis so nothing flickers at the edge. Two draw
  calls however many instances there are.
*/
const ZOOMED_IN = 48
export function LodInstances({ data, count, hi, lo, material, near, y = 0.07, onPick, onHover, onLeave }: Props) {
  const hiMesh = useRef<InstancedMesh>(null)
  const loMesh = useRef<InstancedMesh>(null)
  const hiMap = useRef<number[]>([])
  const loMap = useRef<number[]>([])
  const tier = useRef<Uint8Array>(new Uint8Array(count))
  const last = useRef({ at: new Vector3(Infinity, 0, 0), version: -1, hi: hi, lo: lo })
  const invalidate = useThree((s) => s.invalidate)
  const controls = useThree((s) => s.controls) as unknown as { getTarget?: (out: Vector3) => Vector3 } | null
  const m = useMemo(() => new Matrix4(), [])
  const p = useMemo(() => new Vector3(), [])
  const focus = useMemo(() => new Vector3(), [])

  useFrame(({ camera }) => {
    const d = data.current
    const l = last.current
    const moved = camera.position.distanceToSquared(l.at) > 0.25
    if (!moved && d.version === l.version && l.hi === hi && l.lo === lo) return
    l.at.copy(camera.position)
    l.version = d.version
    l.hi = hi
    l.lo = lo

    if (controls?.getTarget) controls.getTarget(focus)
    const close = camera.position.distanceTo(focus) < ZOOMED_IN
    let nHi = 0
    let nLo = 0
    let switched = false
    const hm = hiMesh.current
    const lm = loMesh.current
    hiMap.current.length = 0
    loMap.current.length = 0
    for (let i = 0; i < count; i++) {
      if (!d.show[i]) continue
      p.set(d.x[i], d.y[i], d.z[i])
      const dist = p.distanceTo(focus)
      const was = tier.current[i]
      const now = hi && close && (dist < near || (was === 1 && dist < near + 3)) ? 1 : 0
      if (now !== was) switched = true
      tier.current[i] = now
      m.makeRotationY(d.rot[i])
      m.setPosition(d.x[i], d.y[i] + y, d.z[i])
      const mesh = now ? hm : lm
      if (!mesh) continue
      const slot = now ? nHi++ : nLo++
      mesh.setMatrixAt(slot, m)
      mesh.setColorAt(slot, d.color[i])
      ;(now ? hiMap : loMap).current.push(i)
    }
    for (const [mesh, n] of [
      [hm, nHi],
      [lm, nLo],
    ] as const) {
      if (!mesh) continue
      mesh.count = n
      mesh.visible = n > 0 // an empty instanced mesh would still cost a draw call
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    if (switched || !moved) markShadows()
    invalidate()
  })

  const pick = (map: MutableRefObject<number[]>) => (e: ThreeEvent<MouseEvent>) => {
    if (!onPick || e.delta > 5 || e.instanceId === undefined) return
    e.stopPropagation()
    onPick(map.current[e.instanceId])
  }

  return (
    <>
      {hi && (
        <instancedMesh
          ref={hiMesh}
          args={[hi, material, count]}
          castShadow
          receiveShadow
          onClick={onPick ? pick(hiMap) : undefined}
          onPointerMove={onHover}
          onPointerOut={onLeave}
          {...(onPick ? {} : { raycast: () => null })}
        />
      )}
      {lo && (
        <instancedMesh
          ref={loMesh}
          args={[lo, material, count]}
          castShadow
          receiveShadow
          onClick={onPick ? pick(loMap) : undefined}
          onPointerMove={onHover}
          onPointerOut={onLeave}
          {...(onPick ? {} : { raycast: () => null })}
        />
      )}
    </>
  )
}
