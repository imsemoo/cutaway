import { Html, Line } from '@react-three/drei'
import { useMemo } from 'react'
import { ROOM_BY_ID, center } from '../data/floorplan'
import { BED } from '../lib/colors'
import { ASSET_LABEL, ASSET_STATUS_LABEL, BED_LABEL, activeCall, assetAt, bedAt, sample } from '../lib/query'
import { useWard } from '../state/store'
import { assetPositions } from './Equipment'
import { WALL_T, ringGeometry } from './geometry'

/** Selection outline plus the floating tag for the hovered or selected item. */
export function Overlays() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const hover = useWard((s) => s.hover)
  const selection = useWard((s) => s.selection)
  const layer = useWard((s) => s.layer)
  const plan = useWard((s) => s.view === 'plan')
  const ring = useMemo(ringGeometry, [])

  if (!day) return null
  const selRoom = selection?.type === 'room' ? ROOM_BY_ID[selection.id] : undefined
  const selAsset = selection?.type === 'asset' ? day.assets.find((a) => a.id === selection.id) : undefined
  const assetPos = selAsset ? assetPositions(day, t).get(selAsset.id) : undefined
  const tagY = plan ? 0.5 : 3.1

  const roomTag = (id: string, strong: boolean) => {
    const r = ROOM_BY_ID[id]
    const c = center(r)
    const bed = bedAt(day, id, t)
    const env = day.rooms[id]
    const call = activeCall(day, id, t)
    const metric =
      layer === 'temp'
        ? `${sample(env.temp, t).toFixed(1)} °C`
        : layer === 'air'
          ? `${Math.round(sample(env.co2, t)).toLocaleString('en-US')} ppm CO₂`
          : layer === 'calls'
            ? call
              ? `Call light, ${Math.max(0, t - call.at).toFixed(0)} min`
              : 'No call light'
            : bed
              ? BED_LABEL[bed.state]
              : r.kind === 'station' ? 'Staff area' : 'Support space'
    return (
      <Html key={`${id}-${strong}`} position={[c.x, tagY, c.z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
        <div className={`tag${strong ? ' tag--strong' : ''}`}>
          <span className="tag__id">{r.kind === 'patient' || r.kind === 'icu' ? r.id : r.name}</span>
          <span className="tag__meta">
            {layer === 'beds' && bed && <i className="tag__dot" style={{ background: BED[bed.state].strong }} />}
            {metric}
          </span>
        </div>
      </Html>
    )
  }

  return (
    <group>
      {selRoom && (
        <Line
          points={[
            [selRoom.x + WALL_T, 0.12, selRoom.z + WALL_T],
            [selRoom.x + selRoom.w - WALL_T, 0.12, selRoom.z + WALL_T],
            [selRoom.x + selRoom.w - WALL_T, 0.12, selRoom.z + selRoom.d - WALL_T],
            [selRoom.x + WALL_T, 0.12, selRoom.z + selRoom.d - WALL_T],
            [selRoom.x + WALL_T, 0.12, selRoom.z + WALL_T],
          ]}
          color="#2946c7"
          lineWidth={3}
        />
      )}
      {selRoom && roomTag(selRoom.id, true)}
      {hover && hover !== selRoom?.id && roomTag(hover, false)}
      {selAsset && assetPos && (
        <group position={[assetPos.x, 0.1, assetPos.z]}>
          <mesh geometry={ring}>
            <meshBasicMaterial color="#2946c7" />
          </mesh>
          <Html position={[0, plan ? 0.5 : 2.4, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
            <div className="tag tag--strong">
              <span className="tag__id">{selAsset.id}</span>
              <span className="tag__meta">
                {ASSET_LABEL[selAsset.kind]}, {ASSET_STATUS_LABEL[assetAt(selAsset, t).status].toLowerCase()}
              </span>
            </div>
          </Html>
        </group>
      )}
    </group>
  )
}
