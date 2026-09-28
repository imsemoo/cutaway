import { ROOMS } from '../data/floorplan'
import { BED } from '../lib/colors'
import { BED_LABEL, activeCall, assetsIn, bedAt, clock, sample } from '../lib/query'
import { useWard } from '../state/store'

/** The same floor as a table: the accessible view, and the fastest scan. */
export function ListView() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const selection = useWard((s) => s.selection)
  const select = useWard((s) => s.select)
  if (!day) return null
  return (
    <div className="listview">
      <table className="rooms">
        <caption className="sr-only">Every room on level 4 at {clock(t)}</caption>
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
          {ROOMS.map((r) => {
            const isBed = r.kind === 'patient' || r.kind === 'icu'
            const s = isBed ? bedAt(day, r.id, t) : undefined
            const env = day.rooms[r.id]
            const call = isBed ? activeCall(day, r.id, t) : undefined
            const eq = assetsIn(day, r.id, t)
            const temp = sample(env.temp, t)
            const co2 = sample(env.co2, t)
            return (
              <tr key={r.id} aria-selected={selection?.id === r.id} className={selection?.id === r.id ? 'is-selected' : undefined}>
                <th scope="row">
                  <button className="link" onClick={() => select({ type: 'room', id: r.id })}>
                    {isBed ? r.id : r.name}
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
    </div>
  )
}
