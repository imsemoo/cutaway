import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, Matrix4, type InstancedMesh } from 'three'
import { BatchedText, Text as TroikaText } from 'troika-three-text'
import monoUrl from '@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff?url'
import sansUrl from '@fontsource/schibsted-grotesk/files/schibsted-grotesk-latin-600-normal.woff?url'
import arabicUrl from '@fontsource/vazirmatn/files/vazirmatn-arabic-600-normal.woff?url'
import { say, useLang } from '../i18n'
import { ROOMS, WING_BY_CODE, isBed } from '../data/floorplan'
import type { Day, Layer, Room } from '../data/types'
import { BED, NEUTRAL_FLOOR, SUPPORT_FLOOR, callColor } from '../lib/colors'
import { airColor, tempColor } from './ramp'
import { activeCall, bedAt, sample } from '../lib/query'
import { useWard } from '../state/store'
import { WALL_T } from './geometry'
import { isWing, shows } from '../state/scope'
import { levelY } from './layout'

const SLAB = 0.07

export function roomColor(day: Day, r: Room, t: number, layer: Layer, out: Color) {
  const env = day.rooms[r.id]
  if (!env) return out.set(NEUTRAL_FLOOR)
  switch (layer) {
    case 'beds': {
      if (!isBed(r)) return out.set(SUPPORT_FLOOR)
      const s = bedAt(day, r.id, t)
      return out.set(s ? BED[s.state].soft : NEUTRAL_FLOOR)
    }
    case 'temp':
      return tempColor(sample(env.temp, t), out)
    case 'air':
      return airColor(sample(env.co2, t), out)
    case 'calls': {
      if (!isBed(r)) return out.set(SUPPORT_FLOOR)
      const c = activeCall(day, r.id, t)
      return out.set(callColor(c ? t - c.at : undefined))
    }
  }
}

/** Every room's floor in the hospital as one instanced mesh: one draw call, and the pick target. */
export function Floors() {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new BoxGeometry(1, SLAB, 1), [])
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const layer = useWard((s) => s.layer)
  const hover = useWard((s) => s.hover)
  const scope = useWard((s) => s.scope)
  const setHover = useWard((s) => s.setHover)
  const select = useWard((s) => s.select)
  const plan = useWard((s) => s.view === 'plan')
  const arabic = useLang((s) => s.lang === 'ar')
  const invalidate = useThree((s) => s.invalidate)

  // The rooms in scope, packed into the first instances; slots maps an instance back to its room.
  const slots = useMemo(() => ROOMS.filter((r) => shows(scope, r.wing)), [scope])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new Matrix4()
    slots.forEach((r, i) => {
      m.makeScale(r.w - WALL_T * 2, 1, r.d - WALL_T * 2)
      m.setPosition(r.x + r.w / 2, levelY(r.level) + SLAB / 2, r.z + r.d / 2)
      mesh.setMatrixAt(i, m)
    })
    mesh.count = slots.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    invalidate()
  }, [slots, invalidate])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const c = new Color()
    const white = new Color('#ffffff')
    slots.forEach((r, i) => {
      if (day) roomColor(day, r, t, layer, c)
      else c.set(NEUTRAL_FLOOR)
      if (hover === r.id) c.lerp(white, 0.45)
      mesh.setColorAt(i, c)
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    invalidate()
  }, [day, t, layer, hover, slots, invalidate])

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const id = e.instanceId !== undefined ? slots[e.instanceId]?.id ?? null : null
    if (id !== useWard.getState().hover) setHover(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }
  const onOut = () => {
    setHover(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const room = e.instanceId === undefined ? undefined : slots[e.instanceId]
    if (e.delta > 5 || !room) return
    e.stopPropagation()
    select({ type: 'room', id: room.id })
  }

  return (
    <group>
      <instancedMesh
        ref={ref}
        args={[geometry, undefined, ROOMS.length]}
        receiveShadow
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      {isWing(scope) && <RoomLabels key={`${scope}-${arabic}`} wing={scope} plan={plan} arabic={arabic} />}
    </group>
  )
}

/**
  Room numbers set into the floor, like tags on a plan. The wing's 38
  labels in two batched meshes, one per typeface: two draw calls instead of
  38. A level or the whole hospital is seen from too far to read them, so they have none.
  In Arabic the room names are set in Vazirmatn, unspaced and in their own case.
*/
function RoomLabels({ wing, plan, arabic }: { wing: string; plan: boolean; arabic: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  const batches = useMemo(() => {
    const mono = new BatchedText()
    const sans = new BatchedText()
    const { rooms, level } = WING_BY_CODE[wing]
    const members = rooms.map((r) => {
      const bed = isBed(r)
      const t = new TroikaText()
      t.text = bed ? r.id : arabic ? say(r.name) : r.name.toUpperCase()
      t.font = bed ? monoUrl : arabic ? arabicUrl : sansUrl
      t.anchorX = 'center'
      t.anchorY = 'middle'
      t.textAlign = 'center'
      t.maxWidth = r.w - 0.6
      t.letterSpacing = bed || arabic ? 0 : 0.06
      const z = bed ? (r.door?.side === 's' ? r.z + r.d - 1.05 : r.z + 1.05) : r.z + r.d / 2
      t.position.set(r.x + r.w / 2, 0, z)
      t.rotation.x = -Math.PI / 2
      ;(bed ? mono : sans).add(t)
      return { t, bed }
    })
    for (const b of [mono, sans]) {
      b.position.y = levelY(level) + SLAB + 0.012
      b.raycast = () => undefined
    }
    return { mono, sans, members }
  }, [wing, arabic])

  useEffect(() => {
    for (const { t, bed } of batches.members) {
      t.fontSize = bed ? (plan ? 0.62 : 0.52) : plan ? 0.46 : 0.38
      t.color = bed ? '#1f2937' : plan ? '#3b4655' : '#5b6572'
    }
    batches.mono.sync(invalidate)
    batches.sans.sync(invalidate)
  }, [plan, batches, invalidate])

  useEffect(
    () => () => {
      batches.members.forEach((m) => m.t.dispose())
      batches.mono.dispose()
      batches.sans.dispose()
    },
    [batches],
  )

  return (
    <>
      <primitive object={batches.mono} />
      <primitive object={batches.sans} />
    </>
  )
}
