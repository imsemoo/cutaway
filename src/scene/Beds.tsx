import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { BED_ROOMS, bedPose } from '../data/floorplan'
import { bedAt } from '../lib/query'
import { useWard } from '../state/store'
import { LodInstances, useInstanceData, type InstanceData } from './LodInstances'
import { getMaterial, getProxies, useModels } from './models'

const n = BED_ROOMS.length
const NEAR = 15
const ACUITY = ['#b3c1d6', '#b3c1d6', '#93a8c9', '#7189b8', '#4f6aa3']

const place = (d: InstanceData) =>
  BED_ROOMS.forEach((r, i) => {
    const p = bedPose(r)
    d.x[i] = p.x
    d.z[i] = p.z
    d.rot[i] = p.rot
  })

/**
  Every bed with the furniture beside it, and a patient under a blanket in
  the occupied ones. The blanket's colour is the patient's acuity.
*/
export function Beds() {
  const models = useModels()
  const proxies = getProxies()
  const material = getMaterial()
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const invalidate = useThree((s) => s.invalidate)
  const beds = useInstanceData(n, place)
  const kits = useInstanceData(n, place)
  const people = useInstanceData(n, place)

  useLayoutEffect(() => {
    const d = people.current
    BED_ROOMS.forEach((r, i) => {
      const s = day ? bedAt(day, r.id, t) : undefined
      d.show[i] = s?.state === 'occupied' ? 1 : 0
      d.color[i].set(ACUITY[s?.acuity ?? 0])
    })
    d.version++
    invalidate()
  }, [day, t, invalidate, people])

  return (
    <group>
      <LodInstances data={beds} count={n} hi={models?.bed} lo={proxies.bed} material={material} near={NEAR} />
      <LodInstances data={people} count={n} hi={models?.occupant} lo={proxies.occupant} material={material} near={NEAR} />
      <LodInstances data={kits} count={n} hi={models?.roomKit} lo={null} material={material} near={NEAR} />
    </group>
  )
}
