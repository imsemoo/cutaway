import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { ROOM_BY_ID } from '../data/floorplan'
import { assetPositions } from '../lib/positions'
import { assetAt } from '../lib/query'
import { useWard } from '../state/store'
import { WALL_T, ringGeometry } from './geometry'
import { levelY } from './layout'

/** The selection outline round a room, or the ring under a piece of equipment. The tags are DOM, see ui/Tags. */
export function Overlays() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const selection = useWard((s) => s.selection)
  const ring = useMemo(ringGeometry, [])

  if (!day || !selection) return null
  if (selection.type === 'room') {
    const r = ROOM_BY_ID[selection.id]
    const [x0, x1, z0, z1] = [r.x + WALL_T, r.x + r.w - WALL_T, r.z + WALL_T, r.z + r.d - WALL_T]
    const y = levelY(r.level) + 0.12
    return (
      <Line
        points={[
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
          [x0, y, z0],
        ]}
        color="#2946c7"
        lineWidth={3}
      />
    )
  }
  const asset = day.assets.find((a) => a.id === selection.id)
  const pos = assetPositions(day, t).get(selection.id)
  if (!asset || !pos) return null
  const level = ROOM_BY_ID[assetAt(asset, t).loc].level
  return (
    <mesh geometry={ring} position={[pos.x, levelY(level) + 0.1, pos.z]}>
      <meshBasicMaterial color="#2946c7" />
    </mesh>
  )
}
