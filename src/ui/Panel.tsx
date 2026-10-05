import { Building2, Play, Unplug } from 'lucide-react'
import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react'
import { BED_ROOMS, LEVELS, ROOMS, STORY, WINGS, WING_BY_CODE, type Wing } from '../data/floorplan'
import type { Alert, Asset, AssetKind, BedState, Day, Severity } from '../data/types'
import { plural, say } from '../i18n'
import { severityAt } from '../lib/alerts'
import { BED } from '../lib/colors'
import { activeAlerts, activeCall, alertWing, assetAt, assetLabel, bedAt, bedLabel, census, clock, wingName } from '../lib/query'
import { HOSPITAL, levelScope, scopeLevel, scopeWings } from '../state/scope'
import { covers, useWard } from '../state/store'
import { wingSummaries, type WingSummary } from './summary'

// The alert list with its actions, the forecast, and a room's or a piece of equipment's details show nothing
// before the day arrives, after the first paint, so they load then.
const alertsModule = () => import('./Alerts')
const aheadModule = () => import('./Ahead')
const detailModule = () => import('./Detail')
export const AlertList = lazy(() => alertsModule().then((m) => ({ default: m.AlertList })))
export const AlertHistory = lazy(() => alertsModule().then((m) => ({ default: m.AlertHistory })))
const Ahead = lazy(aheadModule)
export const RoomPlan = lazy(() => aheadModule().then((m) => ({ default: m.RoomPlan })))
const RoomDetail = lazy(() => detailModule().then((m) => ({ default: m.RoomDetail })))
const AssetDetail = lazy(() => detailModule().then((m) => ({ default: m.AssetDetail })))

const STATES: BedState[] = ['occupied', 'ready', 'cleaning', 'dirty', 'blocked']

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
    void detailModule()
  }, [])
  return (
    <aside ref={aside} className="panel" aria-label={say('Details')}>
      {!day || !ready ? (
        <PanelSkeleton />
      ) : selection?.type === 'room' ? (
        <Suspense fallback={<PanelSkeleton />}>
          <RoomDetail day={day} id={selection.id} />
        </Suspense>
      ) : selection?.type === 'asset' ? (
        <Suspense fallback={<PanelSkeleton />}>
          <AssetDetail day={day} id={selection.id} />
        </Suspense>
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
export const Holding = ({ n }: { n: number }) => <div className="skel skel--block" style={{ height: Math.min(n, 4) * 76 }} aria-hidden="true" />

/** The same twin on a real building: the clinic read from its BIM model, a page of its own. */
const ClinicLink = () => (
  <a className="btn btn--quiet" href="?building=clinic">
    {say('The twin on a real clinic')}
  </a>
)

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
          <ClinicLink />
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
            <ClinicLink />
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
