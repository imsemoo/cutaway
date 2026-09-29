import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { InstancedBufferAttribute, Matrix4, PlaneGeometry, type InstancedMesh } from 'three'
import { ROOMS, WING, WINGS } from '../data/floorplan'
import { shows } from '../state/scope'
import { useWard } from '../state/store'
import { ROW, corridorMaterial } from './field'
import { levelY } from './layout'

/**
  Each wing's footprint, which shows between the rooms as its corridors: the
  palest surface in most layers, and in temperature and air an estimate from
  the doors that open onto it (field.ts). Wings out of scope are not drawn.
*/
export function Corridors() {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(WING.w, WING.d).rotateX(-Math.PI / 2).translate(WING.w / 2, 0.005, WING.d / 2)
    g.setAttribute('aRow', new InstancedBufferAttribute(new Float32Array(WINGS.length), 1))
    return g
  }, [])
  const field = useMemo(corridorMaterial, [])
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const layer = useWard((s) => s.layer)
  const scope = useWard((s) => s.scope)
  const invalidate = useThree((s) => s.invalidate)
  const wings = useMemo(() => WINGS.filter((w) => shows(scope, w.code)), [scope])
  const rooms = useMemo(() => ROOMS.filter((r) => shows(scope, r.wing)), [scope])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rows = geometry.getAttribute('aRow') as InstancedBufferAttribute
    const m = new Matrix4()
    wings.forEach((w, i) => {
      mesh.setMatrixAt(i, m.makeTranslation(w.x, levelY(w.level), w.z))
      rows.setX(i, ROW.get(w.code)!)
    })
    mesh.count = wings.length
    mesh.instanceMatrix.needsUpdate = true
    rows.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [wings, geometry, invalidate])

  useLayoutEffect(() => {
    field.show(day, t, layer, rooms)
    invalidate()
  }, [day, t, layer, rooms, field, invalidate])

  useEffect(
    () => () => {
      geometry.dispose()
      field.dispose()
    },
    [geometry, field],
  )

  return <instancedMesh ref={ref} args={[geometry, field.material, WINGS.length]} receiveShadow />
}
