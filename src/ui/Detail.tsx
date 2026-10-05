import { ArrowLeft, BatteryLow, BellRing } from 'lucide-react'
import { Suspense, useState } from 'react'
import { ROOM_BY_ID, WING_BY_CODE } from '../data/floorplan'
import type { AssetKind, Day, Room } from '../data/types'
import { plural, say } from '../i18n'
import { ASSET_STATUS, BED, SEVERITY } from '../lib/colors'
import {
  activeAlerts,
  activeCall,
  assetAt,
  assetLabel,
  assetsIn,
  batteryAt,
  bedAt,
  bedLabel,
  clock,
  duration,
  roomName,
  roomTitle,
  sample,
  statusLabel,
  walking,
  wingName,
} from '../lib/query'
import { HOSPITAL, levelScope } from '../state/scope'
import { useWard } from '../state/store'
import { DayChart, StateStrip } from './Chart'
import { AlertHistory, AlertList, Holding, RoomPlan } from './Panel'

/*
  A room's and a piece of equipment's details, which the panel loads after the first paint:
  nothing here can show before the day arrives.
*/

/** A span that is still going on (live mode) ends now, as far as anyone knows. */
const until = (to: number) => (Number.isFinite(to) ? clock(to) : say('now'))
/** A name mid-sentence: "the equipment store", but "patient room 4A12" keeps its number. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const celsius = (v: number) => say('{v} °C', { v: v.toFixed(1) })
const ppm = (v: number) => say('{v} ppm', { v: Math.round(v).toLocaleString('en-US') })

/* ---------- Room ---------- */

function Back() {
  const select = useWard((s) => s.select)
  return (
    <button className="back" onClick={() => select(null)}>
      <ArrowLeft className="back__arrow" size={16} strokeWidth={1.75} aria-hidden="true" /> {say('The whole wing')}
    </button>
  )
}

export function RoomDetail({ day, id }: { day: Day; id: string }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const room = ROOM_BY_ID[id]
  const env = day.rooms[id]
  const isBed = room.kind === 'patient' || room.kind === 'icu'
  const bed = bedAt(day, id, t)
  const call = activeCall(day, id, t)
  const calls = day.calls.filter((c) => c.room === id && c.at <= t)
  const here = assetsIn(day, id, t)
  const alerts = activeAlerts(day, t).filter((a) => a.target.type === 'room' && a.target.id === id)
  const temp = sample(env.temp, t)
  const co2 = sample(env.co2, t)

  // Turnaround: the last time this bed went from vacated to ready, up to now.
  const spans = env.spans
  let turnaround: { vacated: number; ready: number } | undefined
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].state === 'dirty' && spans[i].from <= t) {
      const ready = spans.slice(i).find((s) => s.state === 'ready')
      turnaround = { vacated: spans[i].from, ready: ready && ready.from <= t ? ready.from : NaN }
    }
  }

  return (
    <>
      <section className="section">
        <Back />
        <h2 className="title">
          <span className="num">{roomTitle(room)}</span>
          {isBed && <span className="title__sub">{room.kind === 'icu' ? say('ICU bay') : say('Single patient room')}</span>}
        </h2>
        {isBed && bed && (
          <>
            <p className="status">
              <i className="status__dot" style={{ background: BED[bed.state].strong }} />
              <strong>{bedLabel(bed.state)}</strong>
              <span className="muted">
                {' '}
                {bed.from === 0 ? say('since before midnight') : say('since {time}', { time: clock(bed.from) })}
                {bed.state === 'occupied' && bed.acuity ? say(', acuity {n} of 4', { n: bed.acuity }) : ''}
              </span>
            </p>
            {bed.note && <p className="note">{say(bed.note)}.</p>}
            <Suspense fallback={null}>
              <RoomPlan day={day} t={t} room={id} />
            </Suspense>
            <StateStrip
              t={t}
              label={say('Bed states through the day: {states}', {
                states: spans.map((s) => say('{state} {from} to {to}', { state: bedLabel(s.state), from: clock(s.from), to: until(s.to) })).join('; '),
              })}
              parts={spans.map((s) => ({ from: s.from, to: Number.isFinite(s.to) ? s.to : t, color: BED[s.state].soft, title: `${bedLabel(s.state)}, ${clock(s.from)}–${until(s.to)}` }))}
            />
            {turnaround && (
              <p className="small">
                {Number.isNaN(turnaround.ready)
                  ? say('Turnaround today: vacated {vacated}, not ready yet ({wait} so far).', { vacated: clock(turnaround.vacated), wait: duration(t - turnaround.vacated) })
                  : say('Turnaround today: vacated {vacated}, ready {ready}, {wait} out of use.', {
                      vacated: clock(turnaround.vacated),
                      ready: clock(turnaround.ready),
                      wait: duration(turnaround.ready - turnaround.vacated),
                    })}
              </p>
            )}
          </>
        )}
        {alerts.length > 0 && (
          <Suspense fallback={<Holding n={alerts.length} />}>
            <AlertList alerts={alerts} day={day} t={t} />
          </Suspense>
        )}
      </section>

      <section className="section">
        <h2 className="h2">{say('Environment')}</h2>
        <div className="reading">
          <span className="reading__label">{say('Temperature')}</span>
          <span className="reading__value num">{celsius(temp)}</span>
        </div>
        <DayChart series={env.temp} t={t} min={19} max={28} threshold={25.5} label={say('Temperature')} format={celsius} />
        <div className="reading">
          <span className="reading__label">CO₂</span>
          <span className="reading__value num">{ppm(co2)}</span>
        </div>
        <DayChart series={env.co2} t={t} min={350} max={1400} threshold={1000} label="CO₂" format={ppm} />
      </section>

      {isBed && (
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
          <p className="small">
            {calls.length === 0
              ? say('No calls yet today.')
              : plural(calls.length, '{n} call so far today, longest wait {wait} min.', '{n} calls so far today, longest wait {wait} min.', {
                  wait: Math.max(...calls.map((c) => Math.min(c.wait, t - c.at))).toFixed(1),
                })}
          </p>
        </section>
      )}

      <section className="section">
        <h2 className="h2">{say('Equipment here')}</h2>
        {here.length === 0 ? (
          <p className="small">{say('No tracked equipment in this room at {time}.', { time: clock(t) })}</p>
        ) : (
          <ul className="things">
            {here.map((a) => {
              const st = assetAt(a, t)
              const batt = batteryAt(a, t)
              return (
                <li key={a.id}>
                  <button className="thing" onClick={() => select({ type: 'asset', id: a.id })}>
                    <i className="thing__dot" style={{ background: ASSET_STATUS[st.status] }} />
                    <span className="num thing__id">{a.id}</span>
                    <span className="thing__kind">{assetLabel(a.kind)}</span>
                    <span className="thing__meta">
                      {batt !== undefined && batt < 20 && <BatteryLow size={14} strokeWidth={2} style={{ color: SEVERITY.warning }} aria-label={say('Battery low')} />}
                      {statusLabel(st.status)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {isBed && <Nearest room={room} />}

      <Suspense fallback={null}>
        <AlertHistory day={day} t={t} target={{ type: 'room', id }} />
      </Suspense>
    </>
  )
}

/** What a nurse at this bedside most often goes to fetch; a ventilator only from an ICU bay. */
const FETCH: AssetKind[] = ['pump', 'chair', 'scanner']

/** The nearest free piece of equipment of a kind, with the way there drawn on the floors. */
function Nearest({ room }: { room: Room }) {
  const route = useWard((s) => (s.route?.from === room.id ? s.route : null))
  const showRoute = useWard((s) => s.showRoute)
  const [none, setNone] = useState<string | null>(null)
  const kinds: AssetKind[] = room.kind === 'icu' ? [...FETCH, 'vent'] : FETCH

  const find = async (kind: AssetKind) => {
    // The walking graph and its search load only when someone asks for a way.
    const { nearestFree, routeReach } = await import('../lib/wayfinding')
    const { day, t } = useWard.getState()
    const found = day ? nearestFree(day, t, room, kind) : undefined
    setNone(found ? null : say('No {kind} is free anywhere in the hospital at {time}.', { kind: assetLabel(kind).toLowerCase(), time: clock(t) }))
    if (!found) return showRoute(null)
    // Wide enough to hold the whole way: this wing, its level, or the whole hospital when a lift is involved.
    const reach = routeReach(found)
    showRoute(found, reach === 'wing' ? room.wing : reach === 'level' ? levelScope(room.level) : HOSPITAL)
  }

  const at = route ? ROOM_BY_ID[route.at] : undefined
  return (
    <section className="section">
      <h2 className="h2">{say('Nearest free')}</h2>
      <div className="fetch">
        {kinds.map((k) => (
          <button key={k} className="btn btn--quiet btn--small" aria-pressed={route ? route.asset.startsWith(PREFIX[k]) : false} onClick={() => void find(k)}>
            {assetLabel(k)}
          </button>
        ))}
      </div>
      {route && at && (
        <p className="small route" role="status">
          <strong className="num">{route.asset}</strong>{' '}
          {say(at.wing === room.wing ? 'in the {place}: {metres} m, {walk}.' : 'in the {place}, {wing}: {metres} m, {walk}.', {
            place: lowerFirst(roomName(at.id)),
            wing: wingName(WING_BY_CODE[at.wing]),
            metres: Math.round(route.metres),
            walk: walking(route.seconds),
          })}{' '}
          <button className="link" onClick={() => showRoute(null)}>
            {say('Clear the way')}
          </button>
        </p>
      )}
      {none && !route && <p className="small">{none}</p>}
    </section>
  )
}

/** The tag every kind's ids start with. */
const PREFIX: Record<AssetKind, string> = { pump: 'IVP', vent: 'VEN', chair: 'WCH', xray: 'PXR', scanner: 'BSC' }

/* ---------- Asset ---------- */

export function AssetDetail({ day, id }: { day: Day; id: string }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const asset = day.assets.find((a) => a.id === id)
  if (!asset) return null
  const now = assetAt(asset, t)
  const batt = batteryAt(asset, t)
  const alerts = activeAlerts(day, t).filter((a) => a.target.type === 'asset' && a.target.id === id)
  const moves = asset.spans.filter((s) => s.from <= t).slice(-6).reverse()

  return (
    <>
      <section className="section">
        <Back />
        <h2 className="title">
          <span className="num">{asset.id}</span>
          <span className="title__sub">{assetLabel(asset.kind)}</span>
        </h2>
        <p className="status">
          <i className="status__dot" style={{ background: ASSET_STATUS[now.status] }} />
          <strong>{statusLabel(now.status)}</strong>
          <span className="muted"> {now.from === 0 ? say('since before midnight') : say('since {time}', { time: clock(now.from) })}</span>
        </p>
        <p className="small">
          {say('In')}{' '}
          <button className="link" onClick={() => select({ type: 'room', id: now.loc })}>
            {roomName(now.loc)}
          </button>
          .
        </p>
        {alerts.length > 0 && (
          <Suspense fallback={<Holding n={alerts.length} />}>
            <AlertList alerts={alerts} day={day} t={t} />
          </Suspense>
        )}
      </section>

      {asset.battery && batt !== undefined && (
        <section className="section">
          <h2 className="h2">{say('Battery')}</h2>
          <div className="reading">
            <span className="reading__label">{say('Charge')}</span>
            <span className="reading__value num">{batt} %</span>
          </div>
          <DayChart series={asset.battery} t={t} min={0} max={100} threshold={20} label={say('Battery')} format={(v) => `${Math.round(v)} %`} />
        </section>
      )}

      <section className="section">
        <h2 className="h2">{say('Where it has been')}</h2>
        <ol className="moves">
          {moves.map((s) => (
            <li key={s.from} className="moves__item">
              <span className="num moves__time">
                {clock(s.from)}–{s.to > t ? say('now') : clock(s.to)}
              </span>
              <button className="link" onClick={() => select({ type: 'room', id: s.loc })}>
                {roomName(s.loc)}
              </button>
              <span className="muted">{statusLabel(s.status).toLowerCase()}</span>
            </li>
          ))}
        </ol>
      </section>

      <Suspense fallback={null}>
        <AlertHistory day={day} t={t} target={{ type: 'asset', id }} />
      </Suspense>
    </>
  )
}
