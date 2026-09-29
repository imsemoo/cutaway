import { useLayoutEffect, useRef } from 'react'
import { LEVELS, PLATE, ROOM_BY_ID, WING, center } from '../data/floorplan'
import type { Day, Layer } from '../data/types'
import { BED } from '../lib/colors'
import { ASSET_LABEL, ASSET_STATUS_LABEL, BED_LABEL, activeCall, assetAt, bedAt, sample, walking } from '../lib/query'
import { assetPositions } from '../lib/positions'
import { RIM, levelY } from '../scene/layout'
import { HOSPITAL, levelScope, scopeLevel, scopeWings } from '../state/scope'
import { setAnchor } from '../scene/tags'
import { useWard } from '../state/store'

/** The label beside the hovered or selected room or equipment. */
export function Tags() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const hover = useWard((s) => s.hover)
  const selection = useWard((s) => s.selection)
  const layer = useWard((s) => s.layer)
  const view = useWard((s) => s.view)
  const scope = useWard((s) => s.scope)
  const route = useWard((s) => s.route)
  if (!day || view === 'list') return null
  const end = route?.points.at(-1)
  const plan = view === 'plan'
  const selRoom = selection?.type === 'room' ? selection.id : undefined
  const selAsset = selection?.type === 'asset' ? day.assets.find((a) => a.id === selection.id) : undefined
  const assetPos = selAsset ? assetPositions(day, t).get(selAsset.id) : undefined

  return (
    <div className="tags" aria-hidden="true">
      {scopeLevel(scope) &&
        scopeWings(levelScope(scopeLevel(scope)!)).map((w) => (
          <Tag key={`wing-${w.code}`} slot={`wing-${w.code}`} x={w.x + WING.w / 2} y={levelY(w.level) + 3.2} z={w.z} quiet>
            <span className="tag__id">
              {w.code}
              <span className="tag__more"> wing</span>
            </span>
          </Tag>
        ))}
      {scope === HOSPITAL &&
        LEVELS.map((level) => (
          <Tag key={`level-${level}`} slot={`level-${level}`} x={-RIM} y={levelY(level)} z={PLATE.d + RIM} quiet>
            <span className="tag__id">Level {level}</span>
          </Tag>
        ))}
      {selRoom && <RoomTag key="sel" slot="sel" id={selRoom} day={day} t={t} layer={layer} plan={plan} strong />}
      {hover && hover !== selRoom && <RoomTag key="hover" slot="hover" id={hover} day={day} t={t} layer={layer} plan={plan} />}
      {route && end && (
        <Tag slot="route" x={end.x} y={levelY(end.level) + (plan ? 0.5 : 2.4)} z={end.z} strong>
          <span className="tag__id">{route.asset}</span>
          <span className="tag__meta">{walking(route.seconds)}</span>
        </Tag>
      )}
      {selAsset && assetPos && (
        <Tag slot="asset" x={assetPos.x} y={levelY(ROOM_BY_ID[assetAt(selAsset, t).loc].level) + (plan ? 0.5 : 2.4)} z={assetPos.z} strong>
          <span className="tag__id">{selAsset.id}</span>
          <span className="tag__meta">
            {ASSET_LABEL[selAsset.kind]}, {ASSET_STATUS_LABEL[assetAt(selAsset, t).status].toLowerCase()}
          </span>
        </Tag>
      )}
    </div>
  )
}

function RoomTag({ slot, id, day, t, layer, plan, strong }: { slot: string; id: string; day: Day; t: number; layer: Layer; plan: boolean; strong?: boolean }) {
  const r = ROOM_BY_ID[id]
  if (!r) return null
  const c = center(r)
  const isBed = r.kind === 'patient' || r.kind === 'icu'
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
    <Tag slot={slot} x={c.x} y={levelY(r.level) + (plan ? 0.5 : 3.1)} z={c.z} strong={strong}>
      <span className="tag__id">{isBed ? r.id : r.name}</span>
      <span className="tag__meta">
        {layer === 'beds' && bed && <i className="tag__dot" style={{ background: BED[bed.state].strong }} />}
        {metric}
      </span>
    </Tag>
  )
}

function Tag({ slot, x, y, z, strong, quiet, children }: { slot: string; x: number; y: number; z: number; strong?: boolean; quiet?: boolean; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (el.current) setAnchor(slot, { el: el.current, x, y, z })
  }, [slot, x, y, z])
  useLayoutEffect(() => () => setAnchor(slot, null), [slot])
  return (
    <div ref={el} className={`tag${strong ? ' tag--strong' : ''}${quiet ? ' tag--quiet' : ''}`} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  )
}
