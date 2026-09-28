import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { MathUtils } from 'three'
import { ROOM_BY_ID } from '../data/floorplan'
import type { Asset, AssetKind } from '../data/types'
import { ACCENT, ASSET_TINT } from '../lib/colors'
import { assetPositions } from '../lib/positions'
import { assetAt } from '../lib/query'
import { useWard } from '../state/store'
import { LodInstances, useInstanceData } from './LodInstances'
import { getMaterial, getProxies, useModels } from './models'

const KINDS: AssetKind[] = ['pump', 'vent', 'chair', 'xray', 'scanner']
const NEAR = 15

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

/** One kind of equipment: two draw calls (detailed and proxy), coloured by status. */
function Kind({ kind, list }: { kind: AssetKind; list: Asset[] }) {
  const models = useModels()
  const proxies = getProxies()
  const material = getMaterial()
  const day = useWard((s) => s.day)!
  const t = useWard((s) => s.t)
  const selected = useWard((s) => (s.selection?.type === 'asset' ? s.selection.id : null))
  const select = useWard((s) => s.select)
  const invalidate = useThree((s) => s.invalidate)
  const data = useInstanceData(list.length)
  const goal = useRef<{ x: number; z: number }[]>([])
  const placed = useRef(false)

  useLayoutEffect(() => {
    const d = data.current
    const pos = assetPositions(day, t)
    goal.current = list.map((a) => pos.get(a.id)!)
    list.forEach((a, i) => {
      const at = assetAt(a, t)
      // Face the bed in patient rooms; stand square everywhere else.
      d.rot[i] = ROOM_BY_ID[at.loc].head === 's' ? Math.PI : 0
      d.color[i].set(selected === a.id ? ACCENT : ASSET_TINT[at.status])
      if (!placed.current) {
        d.x[i] = goal.current[i].x
        d.z[i] = goal.current[i].z
      }
    })
    placed.current = true
    d.version++
    invalidate()
  }, [day, t, selected, list, data, invalidate])

  // Equipment glides to its new room instead of teleporting.
  useFrame((_, dt) => {
    const d = data.current
    const k = Math.min(dt, 0.05)
    let moving = false
    goal.current.forEach((g, i) => {
      if (d.x[i] === g.x && d.z[i] === g.z) return
      d.x[i] = MathUtils.damp(d.x[i], g.x, 6, k)
      d.z[i] = MathUtils.damp(d.z[i], g.z, 6, k)
      if (Math.abs(d.x[i] - g.x) < 0.01 && Math.abs(d.z[i] - g.z) < 0.01) {
        d.x[i] = g.x
        d.z[i] = g.z
      }
      moving = true
    })
    if (moving) {
      d.version++
      invalidate()
    }
  }, -1)

  return (
    <LodInstances
      data={data}
      count={list.length}
      hi={models?.[kind]}
      lo={proxies[kind]}
      material={material}
      near={NEAR}
      onPick={(i) => select({ type: 'asset', id: list[i].id })}
      onHover={(e) => {
        e.stopPropagation()
        document.body.style.cursor = 'pointer'
        if (useWard.getState().hover) useWard.getState().setHover(null)
      }}
      onLeave={() => (document.body.style.cursor = '')}
    />
  )
}
