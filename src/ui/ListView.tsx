import { LEVELS, WINGS, WING_BY_CODE, isBed, wingName } from '../data/floorplan'
import type { Day } from '../data/types'
import { BED } from '../lib/colors'
import { BED_LABEL, activeCall, assetsIn, bedAt, census, clock, sample } from '../lib/query'
import { isWing, scopeWings } from '../state/scope'
import { covers, useWard } from '../state/store'
import { wingSummaries } from './summary'

/** The same floors as a table: the accessible view, and the fastest scan. A wing lists its rooms; a level or the hospital, its wings. */
export function ListView() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const scope = useWard((s) => s.scope)
  const ready = useWard(covers)
  if (!day || !ready) return null
  return <div className="listview">{isWing(scope) ? <Rooms day={day} t={t} wing={scope} /> : <Wings day={day} t={t} scope={scope} />}</div>
}

function Rooms({ day, t, wing }: { day: Day; t: number; wing: string }) {
  const selection = useWard((s) => s.selection)
  const select = useWard((s) => s.select)
  const w = WING_BY_CODE[wing]
  return (
    <table className="rooms">
      <caption className="sr-only">
        Every room in {wingName(w)} at {clock(t)}
      </caption>
      <thead>
        <tr>
          <th scope="col">Room</th>
          <th scope="col">Bed</th>
          <th scope="col">Since</th>
          <th scope="col" className="num">Temp</th>
          <th scope="col" className="num">CO₂</th>
          <th scope="col">Call light</th>
          <th scope="col">Equipment</th>
        </tr>
      </thead>
      <tbody>
        {w.rooms.map((r) => {
          const bed = isBed(r)
          const s = bed ? bedAt(day, r.id, t) : undefined
          const env = day.rooms[r.id]
          const call = bed ? activeCall(day, r.id, t) : undefined
          const eq = assetsIn(day, r.id, t)
          const temp = sample(env.temp, t)
          const co2 = sample(env.co2, t)
          return (
            <tr key={r.id} aria-selected={selection?.id === r.id} className={selection?.id === r.id ? 'is-selected' : undefined}>
              <th scope="row">
                <button className="link" onClick={() => select({ type: 'room', id: r.id })}>
                  {bed ? r.id : r.name}
                </button>
              </th>
              <td>
                {s ? (
                  <span className="pill">
                    <i style={{ background: BED[s.state].strong }} />
                    <span>
                      {BED_LABEL[s.state]}
                      {s.state === 'occupied' && s.acuity ? <span className="muted">, acuity {s.acuity}</span> : null}
                    </span>
                  </span>
                ) : (
                  <span className="muted">No bed</span>
                )}
              </td>
              <td className="num">{s ? (s.from === 0 ? 'before 00:00' : clock(s.from)) : ''}</td>
              <td className={`num${temp > 25.5 ? ' is-warn' : ''}`}>{temp.toFixed(1)} °C</td>
              <td className={`num${co2 > 1000 ? ' is-warn' : ''}`}>{Math.round(co2).toLocaleString('en-US')}</td>
              <td className={call && t - call.at > 5 ? 'is-warn' : undefined}>{call ? `On ${Math.max(1, Math.round(t - call.at))} min` : ''}</td>
              <td>{eq.map((a) => a.id).join(', ')}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Wings({ day, t, scope }: { day: Day; t: number; scope: string }) {
  const setScope = useWard((s) => s.setScope)
  const summaries = wingSummaries(day, t)
  const on = new Set(scopeWings(scope).map((w) => w.code))
  const rows = [...LEVELS].reverse().flatMap((level) => WINGS.filter((w) => w.level === level && on.has(w.code)))
  return (
    <table className="rooms">
      <caption className="sr-only">
        The wings {on.size === WINGS.length ? 'of the hospital' : `on level ${rows[0]?.level}`} at {clock(t)}
      </caption>
      <thead>
        <tr>
          <th scope="col">Wing</th>
          <th scope="col" className="num">Occupied</th>
          <th scope="col" className="num">Ready</th>
          <th scope="col" className="num">Being cleaned</th>
          <th scope="col" className="num">Waiting for cleaning</th>
          <th scope="col" className="num">Out of service</th>
          <th scope="col" className="num">Alerts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w) => {
          const c = census(day, t, w.beds)
          const s = summaries.get(w.code)!
          return (
            <tr key={w.code}>
              <th scope="row">
                <button className="link" onClick={() => setScope(w.code)}>
                  {wingName(w)}
                </button>
              </th>
              <td className="num">
                {c.occupied} of {w.beds.length}
              </td>
              <td className="num">{c.ready}</td>
              <td className="num">{c.cleaning}</td>
              <td className={`num${c.dirty > 1 ? ' is-warn' : ''}`}>{c.dirty}</td>
              <td className="num">{c.blocked}</td>
              <td className={`num${s.critical ? ' is-warn' : ''}`}>{s.alerts}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
