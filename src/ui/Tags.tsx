import { useLayoutEffect, useRef } from 'react'
import { LEVELS, PLATE, ROOM_BY_ID, WING, WING_BY_CODE, center } from '../data/floorplan'
import type { Day, Layer } from '../data/types'
import { BED } from '../lib/colors'
import { say } from '../i18n'
import { activeCall, assetAt, assetLabel, bedAt, bedLabel, roomTitle, sample, statusLabel, walking, wingName } from '../lib/query'
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
  // "4D wing" or "الجناح 4D": the words around the code come from the translation, and give way on a phone.
  const [before, after] = say('{code} wing').split('{code}')

  return (
    <div className="tags" aria-hidden="true">
      {scopeLevel(scope) &&
        scopeWings(levelScope(scopeLevel(scope)!)).map((w) => (
          <Tag key={`wing-${w.code}`} slot={`wing-${w.code}`} x={w.x + WING.w / 2} y={levelY(w.level) + 3.2} z={w.z} quiet={hover !== w.code} strong={hover === w.code}>
            <span className="tag__id">
              <span className="tag__more">{before}</span>
              {w.code}
              <span className="tag__more">{after}</span>
            </span>
          </Tag>
        ))}
      {scope === HOSPITAL &&
        LEVELS.map((level) => (
          <Tag key={`level-${level}`} slot={`level-${level}`} x={-RIM} y={levelY(level)} z={PLATE.d + RIM} quiet>
            <span className="tag__id">{say('Level {level}', { level })}</span>
          </Tag>
        ))}
      {scope === HOSPITAL && hover && WING_BY_CODE[hover] && (
        <Tag key="hover-wing" slot="hover-wing" x={WING_BY_CODE[hover].x + WING.w / 2} y={levelY(WING_BY_CODE[hover].level) + 3.2} z={WING_BY_CODE[hover].z} strong>
          <span className="tag__id">{wingName(WING_BY_CODE[hover])}</span>
        </Tag>
      )}
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
            {say('{kind}, {status}', { kind: assetLabel(selAsset.kind), status: statusLabel(assetAt(selAsset, t).status).toLowerCase() })}
          </span>
        </Tag>
      )}
    </div>
  )
}

/** What a room's tag says in a layer at minute t: its bed, its reading or its call light. The keyboard cursor announces it too. */
export function roomReading(day: Day, id: string, t: number, layer: Layer) {
  const r = ROOM_BY_ID[id]
  const bed = bedAt(day, id, t)
  const env = day.rooms[id]
  const call = activeCall(day, id, t)
  return layer === 'temp'
    ? say('{v} °C', { v: sample(env.temp, t).toFixed(1) })
    : layer === 'air'
      ? say('{v} ppm CO₂', { v: Math.round(sample(env.co2, t)).toLocaleString('en-US') })
      : layer === 'calls'
        ? call
          ? say('Call light, {n} min', { n: Math.max(0, t - call.at).toFixed(0) })
          : say('No call light')
        : bed
          ? bedLabel(bed.state)
          : r.kind === 'station'
            ? say('Staff area')
            : say('Support space')
}

function RoomTag({ slot, id, day, t, layer, plan, strong }: { slot: string; id: string; day: Day; t: number; layer: Layer; plan: boolean; strong?: boolean }) {
  const r = ROOM_BY_ID[id]
  if (!r) return null
  const c = center(r)
  const bed = bedAt(day, id, t)
  return (
    <Tag slot={slot} x={c.x} y={levelY(r.level) + (plan ? 0.5 : 3.1)} z={c.z} strong={strong}>
      <span className="tag__id">{roomTitle(r)}</span>
      <span className="tag__meta">
        {layer === 'beds' && bed && <i className="tag__dot" style={{ background: BED[bed.state].strong }} />}
        {roomReading(day, id, t, layer)}
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
