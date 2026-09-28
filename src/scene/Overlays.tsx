import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import { ROOM_BY_ID } from '../data/floorplan'
import { assetPositions } from '../lib/positions'
import { useWard } from '../state/store'
import { WALL_T, ringGeometry } from './geometry'

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
    return (
      <Line
        points={[
          [x0, 0.12, z0],
          [x1, 0.12, z0],
          [x1, 0.12, z1],
          [x0, 0.12, z1],
          [x0, 0.12, z0],
        ]}
        color="#2946c7"
        lineWidth={3}
      />
    )
  }
  const pos = assetPositions(day, t).get(selection.id)
  if (!pos) return null
  return (
    <mesh geometry={ring} position={[pos.x, 0.1, pos.z]}>
      <meshBasicMaterial color="#2946c7" />
    </mesh>
  )
}
