import { ArrowLeft, BellRing, Building2 } from 'lucide-react'
import type { Building, BuildingSpace, SpaceKind } from '../data/building'
import type { BedState, Day } from '../data/types'
import { plural, say } from '../i18n'
import { severityAt } from '../lib/alerts'
import { BED, SEVERITY } from '../lib/colors'
import { activeAlerts, activeCall, bedAt, bedLabel, clock, duration, sample } from '../lib/query'
import { useWard } from '../state/store'
import { AlertHistory, AlertList } from '../ui/Alerts'
import { DayChart, StateStrip } from '../ui/Chart'
import { floorName, kindLabel } from './labels'
import { shows } from './layout'
import { useClinic } from './state'

const KINDS: SpaceKind[] = ['care', 'waiting', 'circulation', 'staff', 'support']
const STATES: BedState[] = ['occupied', 'ready', 'cleaning', 'dirty']
const RANK = { critical: 0, warning: 1, info: 2 }

export function ClinicPanel() {
  const building = useClinic((s) => s.building)
  const day = useWard((s) => s.day)
  const selection = useWard((s) => s.selection)
  const room = building && selection ? building.spaces.find((s) => s.id === selection.id) : undefined
  return (
    <aside className="panel" aria-label={say('Details')}>
      {!building || !day ? (
        <div className="section" aria-busy="true" aria-label={say('Reading the clinic')}>
          <div className="skel skel--title" />
          <div className="skel" />
          <div className="skel skel--block" />
        </div>
      ) : room ? (
        <RoomDetail building={building} day={day} room={room} />
      ) : (
        <Overview building={building} day={day} />
      )}
      <p className="credit">
        {say('A concept by')} <a href="https://imsemoo.github.io/eslam-portfolio/">{say('Islam Nasser')}</a>.{' '}
        {say('The plan is a real clinic’s, from its BIM model; its patients and readings are simulated.')}
      </p>
    </aside>
  )
}

function Overview({ building, day }: { building: Building; day: Day }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const floors = useClinic((s) => s.floors)
  const setFloors = useClinic((s) => s.setFloors)
  const care = building.spaces.filter((s) => s.kind === 'care' && shows(s, floors))
  const counts = Object.fromEntries(STATES.map((st) => [st, care.filter((r) => bedAt(day, r.id, t)?.state === st).length])) as Record<BedState, number>
  const here = new Set(building.spaces.filter((s) => shows(s, floors)).map((s) => s.id))
  const alerts = activeAlerts(day, t)
    .filter((a) => here.has(a.target.id))
    .sort((a, b) => RANK[severityAt(a, day, t)] - RANK[severityAt(b, day, t)] || a.from - b.from)
  return (
    <>
      <section className="section intro">
        <p>
          {say(
            'A real building in the twin: the {name}, read from its BIM model, {rooms} rooms on two floors. Its floors, walls and doors are the model’s own; the day on it is simulated. Colour the floor by care rooms, temperature, air or call lights; pick any room for its day.',
            { name: building.name, rooms: building.spaces.length },
          )}
        </p>
        <div className="seg seg--small seg--text" role="radiogroup" aria-label={say('Floors on show')}>
          {(['all', ...building.storeys.map((_, i) => i)] as const).map((f) => (
            <button key={f} role="radio" aria-checked={floors === f} className="seg__btn" onClick={() => setFloors(f)}>
              <span>{f === 'all' ? say('Both floors') : floorName(building.storeys[f].name)}</span>
            </button>
          ))}
        </div>
        <a className="btn btn--quiet" href="./">
          <Building2 size={15} strokeWidth={2} aria-hidden="true" /> {say('The hospital')}
        </a>
      </section>

      <section className="section">
        <h2 className="h2">
          {say('Care rooms at')} <time className="num">{clock(t)}</time>
        </h2>
        <p className="lede">
          <strong className="num">{counts.occupied}</strong>{' '}
          {say('of {rooms} in use. {ready} ready for the next patient, {cleaning} being cleaned, {dirty} waiting to be turned over.', {
            rooms: care.length,
            ready: counts.ready,
            cleaning: counts.cleaning,
            dirty: counts.dirty,
          })}
        </p>
        <div className="board">
          {building.storeys.map((storey, i) =>
            floors === 'all' || floors === i ? (
              <div key={i} className="board__group">
                <span className="board__label">{floorName(storey.name)}</span>
                <div className="board__cells board__cells--wide">
                  {care
                    .filter((r) => r.storey === i)
                    .map((r) => {
                      const s = bedAt(day, r.id, t)
                      const call = activeCall(day, r.id, t)
                      return (
                        <button
                          key={r.id}
                          className="board__cell"
                          style={{ background: s ? BED[s.state].soft : undefined, borderColor: s ? BED[s.state].strong : undefined }}
                          onClick={() => select({ type: 'room', id: r.id })}
                          aria-label={say(call ? '{room}: {state}, call light on' : '{room}: {state}', { room: `${r.id} ${r.name}`, state: s ? bedLabel(s.state) : say('unknown') })}
                          title={`${r.id} ${r.name} · ${s ? bedLabel(s.state) : ''}`}
                        >
                          <span className="board__id">{r.id}</span>
                          {call && <i className="board__call" aria-hidden="true" />}
                        </button>
                      )
                    })}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </section>

      <section className="section">
        <h2 className="h2">
          {say('Needs attention')} <span className="count num">{alerts.length}</span>
        </h2>
        {alerts.length === 0 ? <p className="empty">{say('Nothing is flagged here at {time}.', { time: clock(t) })}</p> : <AlertList alerts={alerts} day={day} t={t} onPick={select} />}
      </section>

      <section className="section">
        <h2 className="h2">{say('Rooms by kind')}</h2>
        <table className="fleet">
          <caption className="fleet__note">{say('Each room’s kind comes from its OmniClass category in the model.')}</caption>
          <thead>
            <tr>
              <th scope="col">{say('Kind')}</th>
              {building.storeys.map((s, i) => (
                <th key={i} scope="col" className="num">
                  {floorName(s.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KINDS.map((k) => (
              <tr key={k}>
                <th scope="row">{kindLabel(k)}</th>
                {building.storeys.map((_, i) => (
                  <td key={i} className="num">
                    {building.spaces.filter((s) => s.kind === k && s.storey === i).length}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2 className="h2">{say('Where the plan comes from')}</h2>
        <p className="small">
          {say('The {title}, {credit}, under {license}.', { title: building.source.title, credit: building.source.credit, license: building.source.license })}{' '}
          <a href={building.source.url}>{say('The model’s source')}</a>.
        </p>
        <p className="small">{say('Read with tools/ifc/import.ts: rooms, walls and doors as the model draws them, to the centimetre; roofs and voids left out.')}</p>
      </section>
    </>
  )
}

function RoomDetail({ building, day, room }: { building: Building; day: Day; room: BuildingSpace }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const env = day.rooms[room.id]
  const bed = bedAt(day, room.id, t)
  const call = activeCall(day, room.id, t)
  const alerts = activeAlerts(day, t).filter((a) => a.target.id === room.id)
  const visits = env.spans.filter((s) => s.state === 'occupied' && s.from <= t).length
  const celsius = (v: number) => say('{v} °C', { v: v.toFixed(1) })
  const ppm = (v: number) => say('{v} ppm', { v: Math.round(v).toLocaleString('en-US') })
  return (
    <>
      <section className="section">
        <button className="back" onClick={() => select(null)}>
          <ArrowLeft className="back__arrow" size={16} strokeWidth={1.75} aria-hidden="true" /> {say('The whole clinic')}
        </button>
        <h2 className="title">
          <span className="num">{room.id}</span>
          <span className="title__sub">{room.name}</span>
        </h2>
        <p className="small">
          {say('{floor}, {area} m².', { floor: floorName(building.storeys[room.storey].name), area: room.area.toFixed(1) })}{' '}
          {/* The model's category, in its own words: an OmniClass number and a name. */}
          <span className="muted" dir="ltr">
            {room.category}
          </span>
        </p>
        {room.kind === 'care' && bed && (
          <>
            <p className="status">
              <i className="status__dot" style={{ background: BED[bed.state].strong }} />
              <strong>{bedLabel(bed.state)}</strong>
              <span className="muted"> {bed.from === 0 ? say('since before midnight') : say('since {time}', { time: clock(bed.from) })}</span>
            </p>
            <StateStrip
              t={t}
              label={say('The room through the day: {states}', { states: env.spans.map((s) => `${bedLabel(s.state)} ${clock(s.from)}`).join('; ') })}
              parts={env.spans.map((s) => ({ from: s.from, to: s.to, color: BED[s.state].soft, title: `${bedLabel(s.state)}, ${clock(s.from)}–${clock(s.to)}` }))}
            />
            <p className="small">{plural(visits, '{n} patient seen here so far today.', '{n} patients seen here so far today.')}</p>
          </>
        )}
        {alerts.length > 0 && <AlertList alerts={alerts} day={day} t={t} />}
      </section>

      <section className="section">
        <h2 className="h2">{say('Environment')}</h2>
        <div className="reading">
          <span className="reading__label">{say('Temperature')}</span>
          <span className="reading__value num">{celsius(sample(env.temp, t))}</span>
        </div>
        <DayChart series={env.temp} t={t} min={19} max={28} threshold={25.5} label={say('Temperature')} format={celsius} />
        <div className="reading">
          <span className="reading__label">CO₂</span>
          <span className="reading__value num">{ppm(sample(env.co2, t))}</span>
        </div>
        <DayChart series={env.co2} t={t} min={350} max={1400} threshold={1000} label="CO₂" format={ppm} />
      </section>

      {room.kind === 'care' && (
        <section className="section">
          <h2 className="h2">{say('Call light')}</h2>
          {call ? (
            <p className="status">
              <BellRing size={15} strokeWidth={2} style={{ color: t - call.at > 5 ? SEVERITY.critical : SEVERITY.warning }} aria-hidden="true" />
              <strong>{say('On for {wait}', { wait: duration(Math.max(1, t - call.at)) })}</strong>
              <span className="muted"> {say('since {time}', { time: clock(call.at) })}</span>
            </p>
          ) : (
            <p className="small">{say('Not on now.')}</p>
          )}
        </section>
      )}

      <AlertHistory day={day} t={t} target={{ type: 'room', id: room.id }} />
    </>
  )
}
