import { ArrowLeft, BatteryLow, BellRing, Building2, Play, Unplug } from 'lucide-react'
import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BED_ROOMS, LEVELS, ROOMS, ROOM_BY_ID, STORY, WINGS, WING_BY_CODE, type Wing } from '../data/floorplan'
import type { Alert, Asset, AssetKind, BedState, Day, Room, Severity } from '../data/types'
import { plural, say } from '../i18n'
import { severityAt } from '../lib/alerts'
import { ASSET_STATUS, BED, SEVERITY } from '../lib/colors'
import {
  activeAlerts,
  activeCall,
  alertWing,
  assetAt,
  assetLabel,
  assetsIn,
  batteryAt,
  bedAt,
  bedLabel,
  census,
  clock,
  duration,
  roomName,
  roomTitle,
  sample,
  statusLabel,
  walking,
  wingName,
} from '../lib/query'
import { HOSPITAL, levelScope, scopeLevel, scopeWings } from '../state/scope'
import { covers, useWard } from '../state/store'
import { DayChart, StateStrip } from './Chart'
import { wingSummaries, type WingSummary } from './summary'

// The alert list with its actions and the forecast show nothing before the day arrives, after the first paint, so they load then.
const alertsModule = () => import('./Alerts')
const aheadModule = () => import('./Ahead')
const AlertList = lazy(() => alertsModule().then((m) => ({ default: m.AlertList })))
const AlertHistory = lazy(() => alertsModule().then((m) => ({ default: m.AlertHistory })))
const Ahead = lazy(aheadModule)
const RoomPlan = lazy(() => aheadModule().then((m) => ({ default: m.RoomPlan })))

/** A span that is still going on (live mode) ends now, as far as anyone knows. */
const until = (to: number) => (Number.isFinite(to) ? clock(to) : say('now'))
const STATES: BedState[] = ['occupied', 'ready', 'cleaning', 'dirty', 'blocked']
/** A name mid-sentence: "the equipment store", but "patient room 4A12" keeps its number. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const celsius = (v: number) => say('{v} °C', { v: v.toFixed(1) })
const ppm = (v: number) => say('{v} ppm', { v: Math.round(v).toLocaleString('en-US') })

/** How the beds stand: the occupied count in bold, then the rest in a sentence. */
function Lede({ counts, beds }: { counts: Record<BedState, number>; beds: number }) {
  return (
    <p className="lede">
      <strong className="num">{counts.occupied.toLocaleString('en-US')}</strong>{' '}
      {say('of {beds} occupied. {ready} ready for a patient, {cleaning} being cleaned, {dirty} waiting for cleaning.', {
        beds: beds.toLocaleString('en-US'),
        ready: counts.ready,
        cleaning: counts.cleaning,
        dirty: counts.dirty,
      })}
    </p>
  )
}

export function Panel() {
  const day = useWard((s) => s.day)
  const ready = useWard(covers)
  const selection = useWard((s) => s.selection)
  const scope = useWard((s) => s.scope)
  const aside = useRef<HTMLElement>(null)
  // A new place opens at the top of its panel. A route widening the view keeps the room, and the reader's place in it.
  const place = selection ? `${selection.type}:${selection.id}` : scope
  useLayoutEffect(() => {
    // A block, not an expression: scrollTo now returns a promise, which React would take for a cleanup.
    aside.current?.scrollTo({ top: 0 })
  }, [place])
  // Fetched while the day is being built, so they are in hand when it arrives.
  useEffect(() => {
    void alertsModule()
    void aheadModule()
  }, [])
  return (
    <aside ref={aside} className="panel" aria-label={say('Details')}>
      {!day || !ready ? (
        <PanelSkeleton />
      ) : selection?.type === 'room' ? (
        <RoomDetail day={day} id={selection.id} />
      ) : selection?.type === 'asset' ? (
        <AssetDetail day={day} id={selection.id} />
      ) : (
        <Overview day={day} />
      )}
      <p className="credit">
        {say('A concept by')} <a href="https://imsemoo.github.io/eslam-portfolio/">{say('Islam Nasser')}</a>.{' '}
        {say('The hospital, patients and readings are simulated.')}
      </p>
    </aside>
  )
}

function PanelSkeleton() {
  return (
    <div className="section" aria-busy="true" aria-label={say('Loading the simulated day')}>
      <div className="skel skel--title" />
      <div className="skel" />
      <div className="skel" />
      <div className="skel skel--block" />
    </div>
  )
}

/* ---------- Overview ---------- */

function Overview({ day }: { day: Day }) {
  const scope = useWard((s) => s.scope)
  const level = scopeLevel(scope)
  return (
    <>
      <Trail />
      {scope === HOSPITAL ? (
        <HospitalOverview day={day} />
      ) : level ? (
        <LevelOverview day={day} level={level} />
      ) : (
        <WingOverview day={day} wing={WING_BY_CODE[scope]} />
      )}
    </>
  )
}

/** Where the view stands in the building, with a way back up at every step. */
function Trail() {
  const scope = useWard((s) => s.scope)
  const setScope = useWard((s) => s.setScope)
  if (scope === HOSPITAL) return null
  const level = scopeLevel(scope) ?? WING_BY_CODE[scope].level
  const steps = [
    { label: say('Hospital'), to: HOSPITAL },
    { label: say('Level {level}', { level }), to: levelScope(level) },
    ...(scopeLevel(scope) ? [] : [{ label: say('{code} wing', { code: scope.slice(1) }), to: scope }]),
  ]
  return (
    <nav className="trail" aria-label={say('Where you are')}>
      <ol>
        {steps.map((s, i) =>
          i === steps.length - 1 ? (
            <li key={s.to} aria-current="location">
              {s.label}
            </li>
          ) : (
            <li key={s.to}>
              <button className="link" onClick={() => setScope(s.to)}>
                {s.label}
              </button>
            </li>
          ),
        )}
      </ol>
    </nav>
  )
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }
/** The alerts open at t, the worst first, then the oldest. */
function ranked(day: Day, t: number, keep: (a: Alert) => boolean = () => true) {
  return activeAlerts(day, t)
    .filter(keep)
    .sort((a, b) => RANK[severityAt(a, day, t)] - RANK[severityAt(b, day, t)] || a.from - b.from)
}

/** "Needs attention", with how many are open and how many no one has acknowledged yet. */
function AttentionHeading({ alerts, day, t }: { alerts: Alert[]; day: Day; t: number }) {
  const fresh = alerts.filter((a) => !day.actions.some((x) => x.alert === a.id && x.at <= t)).length
  return (
    <h2 className="h2">
      {say('Needs attention')} <span className="count num">{alerts.length}</span>
      {fresh > 0 && fresh < alerts.length && (
        <>
          <span className="sr-only">,</span>
          <span className="count count--new num">{plural(fresh, '{n} new', '{n} new')}</span>
        </>
      )}
    </h2>
  )
}

/** Room for the list while its code arrives, so the panel below does not jump. */
const Holding = ({ n }: { n: number }) => <div className="skel skel--block" style={{ height: Math.min(n, 4) * 76 }} aria-hidden="true" />

function PlayButton() {
  const t = useWard((s) => s.t)
  const playing = useWard((s) => s.playing)
  const setPlaying = useWard((s) => s.setPlaying)
  if (playing) return null
  return (
    <button className="btn" onClick={() => setPlaying(true)}>
      <Play size={15} strokeWidth={2} aria-hidden="true" /> {say('Play from {time}', { time: clock(t) })}
    </button>
  )
}

function WingOverview({ day, wing }: { day: Day; wing: Wing }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const setScope = useWard((s) => s.setScope)
  const live = useWard((s) => s.mode === 'live')
  const counts = census(day, t, wing.beds)
  const alerts = ranked(day, t, (a) => alertWing(a) === wing.code)
  // The ICU pod is the one ward named without its code.
  const groups = wing.wards.map((w) => ({
    label: w.label === 'ICU' ? say('ICU') : say('Ward {code}', { code: w.prefix }),
    rooms: wing.beds.filter((r) => r.id.startsWith(w.prefix)),
  }))

  return (
    <>
      <section className="section intro">
        {live ? (
          <LiveIntro />
        ) : (
          <p>
            {say(
              'A digital twin of a {beds}-bed hospital, replaying a simulated day. This is {wing}: two wards and an ICU. Colour the floor by beds, temperature, air or call lights; pick any room or piece of equipment for its day.',
              { beds: BED_ROOMS.length.toLocaleString('en-US'), wing: wingName(wing) },
            )}
          </p>
        )}
        <div className="intro__actions">
          {!live && <PlayButton />}
          <button className="btn btn--quiet" onClick={() => setScope(HOSPITAL)}>
            <Building2 size={15} strokeWidth={2} aria-hidden="true" /> {say('The whole hospital')}
          </button>
        </div>
      </section>

      <section className="section">
        <h2 className="h2">
          {say('Beds at')} <time className="num">{clock(t)}</time>
        </h2>
        <Lede counts={counts} beds={wing.beds.length} />
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
                      aria-label={say(call ? '{room}: {state}, call light on' : '{room}: {state}', { room: r.id, state: s ? bedLabel(s.state) : say('unknown') })}
                      title={`${r.id} · ${s ? bedLabel(s.state) : ''}`}
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
              {bedLabel(s)} <span className="num keys__n">{counts[s]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <AttentionHeading alerts={alerts} day={day} t={t} />
        {alerts.length === 0 ? (
          <p className="empty">
            {!live && wing.code === STORY
              ? say(
                  'Nothing is flagged at {time}. Drag the timeline into the afternoon: discharges, a warm room and a low pump battery all land between 13:00 and 16:00.',
                  { time: clock(t) },
                )
              : say('Nothing is flagged here at {time}.', { time: clock(t) })}
          </p>
        ) : (
          <Suspense fallback={<Holding n={alerts.length} />}>
            <AlertList alerts={alerts} day={day} t={t} onPick={select} />
          </Suspense>
        )}
      </section>

      <Suspense fallback={null}>
        <Ahead day={day} scope={wing.code} />
      </Suspense>

      <section className="section">
        <h2 className="h2">{say('Equipment')}</h2>
        <Fleet t={t} assets={day.assets.filter((a) => a.wing === wing.code)} />
      </section>
    </>
  )
}

/** How many alerts the hospital and level overviews list; each wing lists all of its own. */
const SHOWN = 12

function LevelOverview({ day, level }: { day: Day; level: number }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const live = useWard((s) => s.mode === 'live')
  const wings = scopeWings(levelScope(level))
  const codes = new Set(wings.map((w) => w.code))
  const beds = wings.flatMap((w) => w.beds)
  const counts = census(day, t, beds)
  const alerts = ranked(day, t, (a) => codes.has(alertWing(a) ?? ''))
  const summaries = wingSummaries(day, t)

  return (
    <>
      <section className="section intro">
        {live ? (
          <LiveIntro />
        ) : (
          <p>
            {say('Level {level} of the hospital: six wings of two wards and an ICU, {beds} beds in all, joined by glazed links. Pick a wing to go in.', {
              level,
              beds: beds.length,
            })}
          </p>
        )}
        {!live && (
          <div className="intro__actions">
            <PlayButton />
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h2">
          {say('Beds at')} <time className="num">{clock(t)}</time>
        </h2>
        <Lede counts={counts} beds={beds.length} />
        <div className="levels__wings levels__wings--level">
          {wings.map((w) => (
            <WingChip key={w.code} wing={w} summary={summaries.get(w.code)!} />
          ))}
        </div>
      </section>

      <section className="section">
        <AttentionHeading alerts={alerts} day={day} t={t} />
        {alerts.length === 0 ? (
          <p className="empty">{say('Nothing is flagged on level {level} at {time}.', { level, time: clock(t) })}</p>
        ) : (
          <>
            <Suspense fallback={<Holding n={alerts.length} />}>
              <AlertList alerts={alerts.slice(0, SHOWN)} day={day} t={t} onPick={select} named />
            </Suspense>
            {alerts.length > SHOWN && (
              <p className="small">{say('The worst {shown} of {all}. Each wing lists all of its own.', { shown: SHOWN, all: alerts.length })}</p>
            )}
          </>
        )}
      </section>

      <Suspense fallback={null}>
        <Ahead day={day} scope={levelScope(level)} />
      </Suspense>

      <section className="section">
        <h2 className="h2">{say('Equipment')}</h2>
        <Fleet t={t} assets={day.assets.filter((a) => codes.has(a.wing))} />
      </section>
    </>
  )
}

function HospitalOverview({ day }: { day: Day }) {
  const t = useWard((s) => s.t)
  const select = useWard((s) => s.select)
  const setScope = useWard((s) => s.setScope)
  const live = useWard((s) => s.mode === 'live')
  const counts = census(day, t)
  const alerts = ranked(day, t)
  const wings = wingSummaries(day, t)

  return (
    <>
      <section className="section intro">
        {live ? (
          <LiveIntro />
        ) : (
          <p>
            {say(
              'The whole hospital: six levels of six wings, with {rooms} rooms, {beds} beds and {assets} tracked pieces of equipment. The levels are drawn apart so every floor shows. Pick a wing to go in.',
              { rooms: ROOMS.length.toLocaleString('en-US'), beds: BED_ROOMS.length.toLocaleString('en-US'), assets: day.assets.length.toLocaleString('en-US') },
            )}
          </p>
        )}
        {!live && (
          <div className="intro__actions">
            <PlayButton />
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="h2">
          {say('Beds at')} <time className="num">{clock(t)}</time>
        </h2>
        <Lede counts={counts} beds={BED_ROOMS.length} />
        <ul className="levels">
          {[...LEVELS].reverse().map((level) => (
            <li key={level} className="levels__row">
              <button className="link levels__label" onClick={() => setScope(levelScope(level))}>
                {say('Level {level}', { level })}
              </button>
              <span className="levels__wings">
                {WINGS.filter((w) => w.level === level).map((w) => (
                  <WingChip key={w.code} wing={w} summary={wings.get(w.code)!} />
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <AttentionHeading alerts={alerts} day={day} t={t} />
        {alerts.length === 0 ? (
          <p className="empty">{say('Nothing is flagged anywhere at {time}.', { time: clock(t) })}</p>
        ) : (
          <>
            <Suspense fallback={<Holding n={alerts.length} />}>
              <AlertList alerts={alerts.slice(0, SHOWN)} day={day} t={t} onPick={select} named />
            </Suspense>
            {alerts.length > SHOWN && (
              <p className="small">{say('The worst {shown} of {all}. Each wing lists all of its own.', { shown: SHOWN, all: alerts.length })}</p>
            )}
          </>
        )}
      </section>

      <Suspense fallback={null}>
        <Ahead day={day} scope={HOSPITAL} />
      </Suspense>

      <section className="section">
        <h2 className="h2">{say('Equipment')}</h2>
        <Fleet t={t} assets={day.assets} />
      </section>
    </>
  )
}

/** A wing as a button: its code, how full it is, and a mark when something critical is open in it. */
export function WingChip({ wing, summary }: { wing: Wing; summary: WingSummary }) {
  const setScope = useWard((s) => s.setScope)
  return (
    <button
      className={`chip${summary.critical ? ' chip--critical' : ''}`}
      style={{ ['--full' as string]: (summary.occupied / summary.beds).toFixed(2) }}
      onClick={() => setScope(wing.code)}
      aria-label={say('{wing}: {occupied} of {beds} beds occupied, {alerts}', {
        wing: wingName(wing),
        occupied: summary.occupied,
        beds: summary.beds,
        alerts: plural(summary.alerts, '{n} alert', '{n} alerts'),
      })}
      title={say('{wing} · {occupied} of {beds} occupied · {alerts}', {
        wing: wingName(wing),
        occupied: summary.occupied,
        beds: summary.beds,
        alerts: plural(summary.alerts, '{n} alert', '{n} alerts'),
      })}
    >
      <span className="num">{wing.code}</span>
    </button>
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
          ? say('A digital twin of a hospital, fed live: a mock server streams the simulated day as events, a simulated minute each second.')
          : say('A digital twin of a hospital, built from the events of a live feed.')}{' '}
        {say('The floors hold only what has arrived, so nothing from later in the day is known.')}
      </p>
      {MOCK && (
        // The mock server's code loads with live mode, never before.
        <button className="btn" onClick={() => void import('../live/mock').then((m) => m.outage(4000))} disabled={!up}>
          <Unplug size={15} strokeWidth={2} aria-hidden="true" /> {say('Take the server down for 4 seconds')}
        </button>
      )}
    </>
  )
}

const KINDS: AssetKind[] = ['pump', 'vent', 'chair', 'xray', 'scanner']

function Fleet({ t, assets }: { t: number; assets: Asset[] }) {
  const select = useWard((s) => s.select)
  return (
    <table className="fleet">
      <caption className="fleet__note">{say('Away means charging, or waiting in the soiled utility to be cleaned.')}</caption>
      <thead>
        <tr>
          <th scope="col">{say('Type')}</th>
          <th scope="col" className="num">
            {say('In use')}
          </th>
          <th scope="col" className="num">
            {say('Free')}
          </th>
          <th scope="col" className="num">
            {say('Away')}
          </th>
        </tr>
      </thead>
      <tbody>
        {KINDS.map((k) => {
          const list = assets.filter((a) => a.kind === k)
          const st = list.map((a) => assetAt(a, t).status)
          const inUse = st.filter((s) => s === 'in-use').length
          const free = st.filter((s) => s === 'available').length
          const away = st.length - inUse - free
          const firstFree = list.find((a) => assetAt(a, t).status === 'available')
          return (
            <tr key={k}>
              <th scope="row">
                {firstFree ? (
                  <button className="link" onClick={() => select({ type: 'asset', id: firstFree.id })} title={say('Show a free {kind}', { kind: assetLabel(k).toLowerCase() })}>
                    {assetLabel(k)}
                  </button>
                ) : (
                  assetLabel(k)
                )}
              </th>
              <td className="num">{inUse.toLocaleString('en-US')}</td>
              <td className="num">{free.toLocaleString('en-US')}</td>
              <td className="num" title={say('Charging or waiting for cleaning')}>
                {away.toLocaleString('en-US')}
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
      <ArrowLeft className="back__arrow" size={16} strokeWidth={1.75} aria-hidden="true" /> {say('The whole wing')}
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
