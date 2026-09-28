import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh } from 'three'
import { BED_ROOMS, bedPose } from '../data/floorplan'
import { bedAt } from '../lib/query'
import { useWard } from '../state/store'
import { markShadows } from './shadows'

const n = BED_ROOMS.length
const ACUITY = ['#a9b8cf', '#a9b8cf', '#8da1c2', '#6f86b3', '#4f6aa3']

/** Bed frames always; blanket and pillow only when someone is in the bed. */
export function Beds() {
  const frame = useRef<InstancedMesh>(null)
  const blanket = useRef<InstancedMesh>(null)
  const pillow = useRef<InstancedMesh>(null)
  const geo = useMemo(
    () => ({
      frame: new BoxGeometry(1.0, 0.5, 2.1).translate(0, 0.25, 0),
      blanket: new BoxGeometry(0.96, 0.14, 1.4).translate(0, 0.57, 0.3),
      pillow: new BoxGeometry(0.66, 0.12, 0.34).translate(0, 0.56, -0.74),
    }),
    [],
  )
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const invalidate = useThree((s) => s.invalidate)

  useLayoutEffect(() => {
    const m = new Matrix4()
    BED_ROOMS.forEach((r, i) => {
      const p = bedPose(r)
      m.makeRotationY(p.rot)
      m.setPosition(p.x, 0.07, p.z)
      frame.current!.setMatrixAt(i, m)
    })
    frame.current!.instanceMatrix.needsUpdate = true
  }, [])

  useLayoutEffect(() => {
    if (!blanket.current || !pillow.current) return
    const m = new Matrix4()
    const q = new Quaternion()
    const pos = new Vector3()
    const one = new Vector3(1, 1, 1)
    const zero = new Vector3(0, 0, 0)
    const c = new Color()
    BED_ROOMS.forEach((r, i) => {
      const p = bedPose(r)
      const s = day ? bedAt(day, r.id, t) : undefined
      const inBed = s?.state === 'occupied'
      q.setFromEuler(new Euler(0, p.rot, 0))
      pos.set(p.x, 0.07, p.z)
      m.compose(pos, q, inBed ? one : zero)
      blanket.current!.setMatrixAt(i, m)
      pillow.current!.setMatrixAt(i, m)
      blanket.current!.setColorAt(i, c.set(ACUITY[s?.acuity ?? 0]))
    })
    blanket.current.instanceMatrix.needsUpdate = true
    pillow.current.instanceMatrix.needsUpdate = true
    if (blanket.current.instanceColor) blanket.current.instanceColor.needsUpdate = true
    markShadows()
    invalidate()
  }, [day, t, invalidate])

  return (
    <group>
      <instancedMesh ref={frame} args={[geo.frame, undefined, n]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color="#e4e8ed" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={blanket} args={[geo.blanket, undefined, n]} castShadow raycast={() => null}>
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={pillow} args={[geo.pillow, undefined, n]} raycast={() => null}>
        <meshStandardMaterial color="#ffffff" roughness={0.95} />
      </instancedMesh>
    </group>
  )
}
