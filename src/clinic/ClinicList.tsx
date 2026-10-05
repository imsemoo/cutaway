import type { SpaceKind } from '../data/building'
import { LIMIT } from '../data/limits'
import { say } from '../i18n'
import { BED } from '../lib/colors'
import { activeCall, bedAt, bedLabel, clock, sample } from '../lib/query'
import { useWard } from '../state/store'
import { KIND_ONE, floorName } from './labels'
import { shows } from './layout'
import { useClinic } from './state'

const ORDER: Record<SpaceKind, number> = { care: 0, waiting: 1, circulation: 2, staff: 3, support: 4 }

/** The clinic as a table: every room on the floors on show, care rooms first on each floor. */
export default function ClinicList() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const selection = useWard((s) => s.selection)
  const select = useWard((s) => s.select)
  const building = useClinic((s) => s.building)
  const floors = useClinic((s) => s.floors)
  if (!day || !building) return null
  const rooms = building.spaces.filter((s) => shows(s, floors)).sort((a, b) => a.storey - b.storey || ORDER[a.kind] - ORDER[b.kind] || a.id.localeCompare(b.id))
  return (
    <div className="listview">
      <table className="rooms">
        <caption className="sr-only">{say('Every room in the clinic at {time}', { time: clock(t) })}</caption>
        <thead>
          <tr>
            <th scope="col">{say('Room')}</th>
            <th scope="col">{say('Kind')}</th>
            <th scope="col">{say('Floor')}</th>
            <th scope="col">{say('State')}</th>
            <th scope="col" className="num">
              {say('Temp')}
            </th>
            <th scope="col" className="num">
              CO₂
            </th>
            <th scope="col">{say('Call light')}</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => {
            const s = r.kind === 'care' ? bedAt(day, r.id, t) : undefined
            const call = r.kind === 'care' ? activeCall(day, r.id, t) : undefined
            const env = day.rooms[r.id]
            const temp = sample(env.temp, t)
            const co2 = sample(env.co2, t)
            return (
              <tr key={r.id} aria-selected={selection?.id === r.id} className={selection?.id === r.id ? 'is-selected' : undefined}>
                <th scope="row">
                  <button className="link" onClick={() => select({ type: 'room', id: r.id })}>
                    <span className="num">{r.id}</span> {r.name}
                  </button>
                </th>
                <td>{say(KIND_ONE[r.kind])}</td>
                <td>{floorName(building.storeys[r.storey].name)}</td>
                <td>
                  {s && (
                    <span className="pill">
                      <i style={{ background: BED[s.state].strong }} />
                      <span>
                        {bedLabel(s.state)}
                        <span className="muted"> {s.from === 0 ? say('before 00:00') : clock(s.from)}</span>
                      </span>
                    </span>
                  )}
                </td>
                <td className={`num${temp > LIMIT.temp ? ' is-warn' : ''}`}>{say('{v} °C', { v: temp.toFixed(1) })}</td>
                <td className={`num${co2 > LIMIT.co2 ? ' is-warn' : ''}`}>{Math.round(co2).toLocaleString('en-US')}</td>
                <td className={call && t - call.at > LIMIT.call ? 'is-warn' : undefined}>{call ? say('On {n} min', { n: Math.max(1, Math.round(t - call.at)) }) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
