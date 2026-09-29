import { ArrowLeft, BatteryLow, BellRing, Info, OctagonAlert, Play, TriangleAlert, Unplug } from 'lucide-react'
import { BED_ROOMS, ROOM_BY_ID } from '../data/floorplan'
import type { Alert, AssetKind, BedState, Day, Severity } from '../data/types'
import { describe, severityAt } from '../lib/alerts'
import { ASSET_STATUS, BED, SEVERITY } from '../lib/colors'
import {
  ASSET_LABEL,
  ASSET_STATUS_LABEL,
  BED_LABEL,
  activeAlerts,
  activeCall,
  assetAt,
  assetsIn,
  batteryAt,
  bedAt,
  census,
  clock,
  duration,
  roomName,
  sample,
} from '../lib/query'
import { outage } from '../live/mock'
import { useWard } from '../state/store'
import { DayChart, StateStrip } from './Chart'

const SEV_ICON: Record<Severity, typeof Info> = { critical: OctagonAlert, warning: TriangleAlert, info: Info }
/** A span that is still going on (live mode) ends now, as far as anyone knows. */
const until = (to: number) => (Number.isFinite(to) ? clock(to) : 'now')
const STATES: BedState[] = ['occupied', 'ready', 'cleaning', 'dirty', 'blocked']

export function Panel() {
  const day = useWard((s) => s.day)
  const selection = useWard((s) => s.selection)
  return (
    <aside className="panel" aria-label="Details">
      {!day ? (
        <PanelSkeleton />
      ) : selection?.type === 'room' ? (
        <RoomDetail day={day} id={selection.id} />
      ) : selection?.type === 'asset' ? (
        <AssetDetail day={day} id={selection.id} />
      ) : (
        <Overview day={day} />
      )}
      <p className="credit">
        A concept by <a href="https://imsemoo.github.io/eslam-portfolio/">Islam Nasser</a>. The hospital, patients and readings are simulated.
      </p>
    </aside>
  )
}

function PanelSkeleton() {
  return (
    <div className="section" aria-busy="true" aria-label="Loading the simulated day">
      <div className="skel skel--title" />
      <div className="skel" />
      <div className="skel" />
      <div className="skel skel--block" />
    </div>
  )
}

/* ---------- Overview ---------- */

function Overview({ day }: { day: Day }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const counts = census(day, t)
  const total = BED_ROOMS.length
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
  const alerts = activeAlerts(day, t).sort((a, b) => rank[severityAt(a, day, t)] - rank[severityAt(b, day, t)] || a.from - b.from)
  const setPlaying = useWard((s) => s.setPlaying)
  const playing = useWard((s) => s.playing)
  const live = useWard((s) => s.mode === 'live')
  const groups = [
    { label: 'Ward 4A', rooms: BED_ROOMS.filter((r) => r.id.startsWith('4A')) },
    { label: 'Ward 4B', rooms: BED_ROOMS.filter((r) => r.id.startsWith('4B')) },
    { label: 'ICU', rooms: BED_ROOMS.filter((r) => r.kind === 'icu') },
  ]

  return (
    <>
      <section className="section intro">
        {live ? (
          <LiveIntro />
        ) : (
          <>
            <p>
              A digital twin of one hospital floor, replaying a simulated day. Colour the floor by beds, temperature, air or call lights; pick any room or
              piece of equipment for its day.
            </p>
            {!playing && (
              <button className="btn" onClick={() => setPlaying(true)}>
                <Play size={15} strokeWidth={2} aria-hidden="true" /> Play from {clock(t)}
              </button>
            )}
          </>
        )}
      </section>

      <section className="section">
        <h2 className="h2">
          Beds at <time className="num">{clock(t)}</time>
        </h2>
        <p className="lede">
          <strong className="num">{counts.occupied}</strong> of {total} occupied. {counts.ready} ready for a patient, {counts.cleaning} being cleaned,{' '}
          {counts.dirty} waiting for cleaning.
        </p>
        <div className="board">
          {groups.map((g) => (
            <div key={g.label} className="board__group">
              <span className="board__label">{g.label}</span>
              <div className="board__cells">
                {g.rooms.map((r) => {
                  const s = bedAt(day, r.id, t)
                  const call = activeCall(day, r.id, t)
                  return (
                    <button
                      key={r.id}
                      className="board__cell"
                      style={{ background: s ? BED[s.state].soft : undefined, borderColor: s ? BED[s.state].strong : undefined }}
                      onClick={() => select({ type: 'room', id: r.id })}
                      aria-label={`${r.id}: ${s ? BED_LABEL[s.state] : 'unknown'}${call ? ', call light on' : ''}`}
                      title={`${r.id} · ${s ? BED_LABEL[s.state] : ''}`}
                    >
                      <span className="board__id">{r.id.slice(2)}</span>
                      {call && <i className="board__call" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <ul className="keys">
          {STATES.map((s) => (
            <li key={s} className="keys__item">
              <i className="keys__swatch" style={{ background: BED[s].soft, borderColor: BED[s].strong }} />
              {BED_LABEL[s]} <span className="num keys__n">{counts[s]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="h2">
          Needs attention <span className="count num">{alerts.length}</span>
        </h2>
        {alerts.length === 0 ? (
          <p className="empty">
            {live
              ? `Nothing is flagged at ${clock(t)}.`
              : `Nothing is flagged at ${clock(t)}. Drag the timeline into the afternoon: discharges, a warm room and a low pump battery all land between 13:00 and 16:00.`}
          </p>
        ) : (
          <ul className="alerts">
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} day={day} t={t} onPick={() => select(a.target)} />
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="h2">Equipment</h2>
        <Fleet day={day} t={t} />
      </section>
    </>
  )
}

/** The mock server is the demo's; a real feed (VITE_FEED_URL) cannot be taken down from here. */
const MOCK = !import.meta.env.VITE_FEED_URL

function LiveIntro() {
  const up = useWard((s) => s.feed.state === 'live')
  return (
    <>
      <p>
        {MOCK
          ? 'A digital twin of one hospital floor, fed live: a mock server streams the simulated day as events, a simulated minute each second. '
          : 'A digital twin of one hospital floor, built from the events of a live feed. '}
        The floor holds only what has arrived, so nothing from later in the day is known.
      </p>
      {MOCK && (
        <button className="btn" onClick={() => outage(4000)} disabled={!up}>
          <Unplug size={15} strokeWidth={2} aria-hidden="true" /> Take the server down for 4 seconds
        </button>
      )}
    </>
  )
}

function AlertRow({ alert, day, t, onPick }: { alert: Alert; day: Day; t: number; onPick?: () => void }) {
  const severity = severityAt(alert, day, t)
  const Icon = SEV_ICON[severity]
  const where = alert.target.id
  const body = (
    <>
      <Icon className="alert__icon" size={16} strokeWidth={2} style={{ color: SEVERITY[severity] }} aria-label={severity} />
        <span className="alert__body">
          <span className="alert__title">
            {alert.title} <span className="alert__where num">{where}</span>
          </span>
        <span className="alert__detail">{describe(alert, day, t)}</span>
      </span>
      <span className="alert__age num" aria-label={`flagged at ${clock(alert.from)}`}>
        {clock(alert.from)}
      </span>
    </>
  )
  return <li>{onPick ? <button className="alert" onClick={onPick}>{body}</button> : <div className="alert alert--static">{body}</div>}</li>
}

const KINDS: AssetKind[] = ['pump', 'vent', 'chair', 'xray', 'scanner']

function Fleet({ day, t }: { day: Day; t: number }) {
  const select = useWard((s) => s.select)
  return (
    <table className="fleet">
      <caption className="fleet__note">Away means charging, or waiting in the soiled utility to be cleaned.</caption>
      <thead>
        <tr>
          <th scope="col">Type</th>
          <th scope="col" className="num">In use</th>
          <th scope="col" className="num">Free</th>
          <th scope="col" className="num">Away</th>
        </tr>
      </thead>
      <tbody>
        {KINDS.map((k) => {
          const list = day.assets.filter((a) => a.kind === k)
          const st = list.map((a) => assetAt(a, t).status)
          const inUse = st.filter((s) => s === 'in-use').length
          const free = st.filter((s) => s === 'available').length
          const away = st.length - inUse - free
          const firstFree = list.find((a) => assetAt(a, t).status === 'available')
          return (
            <tr key={k}>
              <th scope="row">
                {firstFree ? (
                  <button className="link" onClick={() => select({ type: 'asset', id: firstFree.id })} title={`Show the nearest free ${ASSET_LABEL[k].toLowerCase()}`}>
                    {ASSET_LABEL[k]}
                  </button>
                ) : (
                  ASSET_LABEL[k]
                )}
              </th>
              <td className="num">{inUse}</td>
              <td className="num">{free}</td>
              <td className="num" title="Charging or waiting for cleaning">
                {away}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ---------- Room ---------- */

function Back() {
  const select = useWard((s) => s.select)
  return (
    <button className="back" onClick={() => select(null)}>
      <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Whole floor
    </button>
  )
}

function RoomDetail({ day, id }: { day: Day; id: string }) {
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
          <span className="num">{isBed ? room.id : room.name}</span>
          {isBed && <span className="title__sub">{room.kind === 'icu' ? 'ICU bay' : 'Single patient room'}</span>}
        </h2>
        {isBed && bed && (
          <>
            <p className="status">
              <i className="status__dot" style={{ background: BED[bed.state].strong }} />
              <strong>{BED_LABEL[bed.state]}</strong>
              <span className="muted">
                {' '}
                since {bed.from === 0 ? 'before midnight' : clock(bed.from)}
                {bed.state === 'occupied' && bed.acuity ? `, acuity ${bed.acuity} of 4` : ''}
              </span>
            </p>
            {bed.note && <p className="note">{bed.note}.</p>}
            <StateStrip
              t={t}
              label={`Bed states through the day: ${spans.map((s) => `${BED_LABEL[s.state]} ${clock(s.from)} to ${until(s.to)}`).join('; ')}`}
              parts={spans.map((s) => ({ from: s.from, to: Number.isFinite(s.to) ? s.to : t, color: BED[s.state].soft, title: `${BED_LABEL[s.state]}, ${clock(s.from)}–${until(s.to)}` }))}
            />
            {turnaround && (
              <p className="small">
                Turnaround today: vacated {clock(turnaround.vacated)},{' '}
                {Number.isNaN(turnaround.ready)
                  ? `not ready yet (${duration(t - turnaround.vacated)} so far)`
                  : `ready ${clock(turnaround.ready)}, ${duration(turnaround.ready - turnaround.vacated)} out of use`}
                .
              </p>
            )}
          </>
        )}
        {alerts.length > 0 && (
          <ul className="alerts alerts--tight">
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} day={day} t={t} />
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="h2">Environment</h2>
        <div className="reading">
          <span className="reading__label">Temperature</span>
          <span className="reading__value num">{temp.toFixed(1)} °C</span>
        </div>
        <DayChart series={env.temp} t={t} min={19} max={28} threshold={25.5} label="Temperature" format={(v) => `${v.toFixed(1)} °C`} />
        <div className="reading">
          <span className="reading__label">CO₂</span>
          <span className="reading__value num">{Math.round(co2).toLocaleString('en-US')} ppm</span>
        </div>
        <DayChart series={env.co2} t={t} min={350} max={1400} threshold={1000} label="CO₂" format={(v) => `${Math.round(v).toLocaleString('en-US')} ppm`} />
      </section>

      {isBed && (
        <section className="section">
          <h2 className="h2">Call light</h2>
          {call ? (
            <p className="status">
              <BellRing size={15} strokeWidth={2} style={{ color: t - call.at > 5 ? SEVERITY.critical : SEVERITY.warning }} aria-hidden="true" />
              <strong>On for {duration(Math.max(1, t - call.at))}</strong>
              <span className="muted"> since {clock(call.at)}</span>
            </p>
          ) : (
            <p className="small">Not on now.</p>
          )}
          <p className="small">
            {calls.length === 0
              ? 'No calls yet today.'
              : `${calls.length} ${calls.length === 1 ? 'call' : 'calls'} so far today, longest wait ${Math.max(...calls.map((c) => Math.min(c.wait, t - c.at))).toFixed(1)} min.`}
          </p>
        </section>
      )}

      <section className="section">
        <h2 className="h2">Equipment here</h2>
        {here.length === 0 ? (
          <p className="small">No tracked equipment in this room at {clock(t)}.</p>
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
                    <span className="thing__kind">{ASSET_LABEL[a.kind]}</span>
                    <span className="thing__meta">
                      {batt !== undefined && batt < 20 && <BatteryLow size={14} strokeWidth={2} style={{ color: SEVERITY.warning }} aria-label="Battery low" />}
                      {ASSET_STATUS_LABEL[st.status]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}

/* ---------- Asset ---------- */

function AssetDetail({ day, id }: { day: Day; id: string }) {
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
          <span className="title__sub">{ASSET_LABEL[asset.kind]}</span>
        </h2>
        <p className="status">
          <i className="status__dot" style={{ background: ASSET_STATUS[now.status] }} />
          <strong>{ASSET_STATUS_LABEL[now.status]}</strong>
          <span className="muted"> since {now.from === 0 ? 'before midnight' : clock(now.from)}</span>
        </p>
        <p className="small">
          In{' '}
          <button className="link" onClick={() => select({ type: 'room', id: now.loc })}>
            {roomName(now.loc)}
          </button>
          .
        </p>
        {alerts.length > 0 && (
          <ul className="alerts alerts--tight">
            {alerts.map((a) => (
              <AlertRow key={a.id} alert={a} day={day} t={t} />
            ))}
          </ul>
        )}
      </section>

      {asset.battery && batt !== undefined && (
        <section className="section">
          <h2 className="h2">Battery</h2>
          <div className="reading">
            <span className="reading__label">Charge</span>
            <span className="reading__value num">{batt} %</span>
          </div>
          <DayChart series={asset.battery} t={t} min={0} max={100} threshold={20} label="Battery" format={(v) => `${Math.round(v)} %`} />
        </section>
      )}

      <section className="section">
        <h2 className="h2">Where it has been</h2>
        <ol className="moves">
          {moves.map((s) => (
            <li key={s.from} className="moves__item">
              <span className="num moves__time">
                {clock(s.from)}–{s.to > t ? 'now' : clock(s.to)}
              </span>
              <button className="link" onClick={() => select({ type: 'room', id: s.loc })}>
                {roomName(s.loc)}
              </button>
              <span className="muted">{ASSET_STATUS_LABEL[s.status].toLowerCase()}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
