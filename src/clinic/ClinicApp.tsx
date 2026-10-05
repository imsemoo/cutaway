import { BedDouble, BellRing, Box, List, Map as MapIcon, Pause, Play, Thermometer, Wind } from 'lucide-react'
import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react'
import type { Building, BuildingSpace } from '../data/building'
import type { BedState, Layer, View } from '../data/types'
import { plural, say, setLang, useLang } from '../i18n'
import { alertTitle } from '../lib/alerts'
import { AIR_STOPS, BED, SEVERITY, TEMP_STOPS, callColor } from '../lib/colors'
import { activeCall, bedAt, bedLabel, clock, sample } from '../lib/query'
import { setAnchor } from '../scene/tags'
import { HOSPITAL } from '../state/scope'
import { DEFAULT_TIME, SPEEDS, useWard } from '../state/store'
import { ClinicPanel } from './ClinicPanel'
import { floorName } from './labels'
import { WALL, floorOffset, shows } from './layout'
import { simulateClinic } from './simulate'
import { useClinic } from './state'

/*
  The twin on a real building: the Medical-Dental Clinic, imported from its
  BIM model (tools/ifc, public/buildings/clinic.json), with a simulated day.
  It shares the hospital's store, alert list, charts and styles; what is
  its own is the building, its scene and its panel. Opened with
  ?building=clinic, and loaded only then.
*/

const ClinicScene = lazy(() => import('./ClinicScene'))
const ClinicList = lazy(() => import('./ClinicList'))

export default function ClinicApp() {
  const view = useWard((s) => s.view)
  const building = useClinic((s) => s.building)
  const lang = useLang((s) => s.lang)
  useBuilding()
  useClinicUrl()
  useEffect(() => {
    document.title = say('Cutaway: a clinic from its BIM model')
  }, [lang])
  usePlayback()
  useEscape()
  return (
    <div className="app" data-view={view}>
      <a className="skip" href="#details">
        {say('Skip to details')}
      </a>
      <ClinicBar />
      <main className="stage" aria-label={say('Floor model')}>
        <Suspense fallback={null}>{view !== 'list' && <ClinicScene />}</Suspense>
        {building && view !== 'list' && <ClinicTags building={building} />}
        <ClinicDock />
        {view === 'list' && (
          <Suspense fallback={null}>
            <ClinicList />
          </Suspense>
        )}
        {!building && (
          <div className="loading" role="status">
            {say('Reading the clinic’s model…')}
          </div>
        )}
      </main>
      <ClinicTimeline key={lang} />
      <div id="details" className="panel-wrap">
        <ClinicPanel />
      </div>
    </div>
  )
}

/** Fetches the building, simulates its day, and hands both to the stores; a link's room is selected once it is there. */
function useBuilding() {
  useEffect(() => {
    let left = false
    void fetch('./buildings/clinic.json')
      .then((r) => r.json() as Promise<Building>)
      .then((building) => {
        if (left) return
        const day = simulateClinic(building)
        const id = new URLSearchParams(location.search).get('room')?.toUpperCase()
        const room = building.spaces.find((s) => s.id === id)
        useClinic.setState({ building, ...(room && { floors: room.storey }) })
        useWard.setState({ day, recorded: day, complete: true, scope: HOSPITAL, selection: room ? { type: 'room', id: room.id } : null })
      })
    return () => {
      left = true
    }
  }, [])
}

/** Keeps the address bar in step: building=clinic, then the room, minute, layer and view. */
function useClinicUrl() {
  useEffect(() => {
    const write = () => {
      const s = useWard.getState()
      if (s.playing) return
      const q = new URLSearchParams(location.search)
      const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k))
      set('room', s.selection?.id ?? null)
      set('select', null)
      set('layer', s.layer === 'beds' ? null : s.layer)
      set('view', s.view === '3d' ? null : s.view)
      set('t', Math.round(s.t) === DEFAULT_TIME ? null : clock(s.t))
      const next = `?${q.toString().replace(/%3A/g, ':')}`
      if (next !== location.search) history.replaceState(null, '', next)
    }
    return useWard.subscribe(write)
  }, [])
}

/** Advances the clock while playing, about twelve updates a second, as the hospital's does. */
function usePlayback() {
  const playing = useWard((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = -1
    const loop = (now: number) => {
      if (last < 0) last = now
      if (now - last >= 80) {
        const { t, speed, setT, setPlaying } = useWard.getState()
        const next = t + ((now - last) / 1000) * speed
        last = now
        if (next >= 1439) {
          setT(1439)
          return setPlaying(false)
        }
        setT(next)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}

/** Escape leaves a room; Space plays the day, outside buttons and fields. */
function useEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select')) return
      const s = useWard.getState()
      if (e.key === 'Escape' && s.selection) s.select(null)
      else if (e.key === ' ' && !el.closest('button, a, [role="radio"]')) {
        e.preventDefault()
        s.setPlaying(!s.playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

const VIEWS: { id: View; label: string; icon: typeof Box }[] = [
  { id: '3d', label: '3D', icon: Box },
  { id: 'plan', label: 'Plan', icon: MapIcon },
  { id: 'list', label: 'List', icon: List },
]

function ClinicBar() {
  const view = useWard((s) => s.view)
  const setView = useWard((s) => s.setView)
  const building = useClinic((s) => s.building)
  const lang = useLang((s) => s.lang)
  const other = lang === 'ar' ? 'en' : 'ar'
  return (
    <header className="bar">
      <div className="brand">
        <img className="brand__mark" src="./logo.svg" alt="" width="28" height="28" />
        <div className="brand__text">
          <span className="brand__name">{say('Cutaway')}</span>
          <span className="brand__where">
            {building ? say('{name} · two floors, {rooms}', { name: building.name, rooms: plural(building.spaces.length, '{n} room', '{n} rooms') }) : say('A clinic from its BIM model')}
          </span>
        </div>
      </div>
      <span className="badge" title={say('The plan is a real clinic’s, from its BIM model; its patients and readings are simulated.')}>
        {say('Simulated data')}
      </span>
      <button className="lang" lang={other} onClick={() => void setLang(other)}>
        {other === 'ar' ? 'العربية' : 'English'}
      </button>
      <div className="seg" role="radiogroup" aria-label={say('View')}>
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={view === id} aria-label={say(label)} className="seg__btn" onClick={() => setView(id)}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{say(label)}</span>
          </button>
        ))}
      </div>
    </header>
  )
}

const LAYERS: { id: Layer; label: string; icon: typeof BedDouble }[] = [
  { id: 'beds', label: 'Care rooms', icon: BedDouble },
  { id: 'temp', label: 'Temperature', icon: Thermometer },
  { id: 'air', label: 'Air', icon: Wind },
  { id: 'calls', label: 'Call lights', icon: BellRing },
]

/** The layer switch and its key, as the hospital's, counting the clinic's care rooms. */
function ClinicDock() {
  const layer = useWard((s) => s.layer)
  const setLayer = useWard((s) => s.setLayer)
  const view = useWard((s) => s.view)
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const building = useClinic((s) => s.building)
  const floors = useClinic((s) => s.floors)
  if (view === 'list') return null
  const care = building ? building.spaces.filter((s) => s.kind === 'care' && shows(s, floors)) : []
  const count = (st: BedState) => (day ? care.filter((r) => bedAt(day, r.id, t)?.state === st).length : undefined)
  return (
    <div className="dock">
      <div className="seg seg--dock" role="radiogroup" aria-label={say('Colour the floor by')}>
        {LAYERS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={layer === id} aria-label={say(label)} className="seg__btn" onClick={() => setLayer(id)}>
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{say(label)}</span>
          </button>
        ))}
      </div>
      {layer === 'beds' ? (
        <ul className="legend">
          {(['occupied', 'ready', 'cleaning', 'dirty'] as BedState[]).map((s) => (
            <li key={s}>
              <i style={{ background: BED[s].soft, borderColor: BED[s].strong }} />
              {bedLabel(s)}
              {count(s) !== undefined && <span className="num legend__n">{count(s)}</span>}
            </li>
          ))}
        </ul>
      ) : layer === 'calls' ? (
        <ul className="legend">
          <li>
            <i style={{ background: callColor(1) }} />
            {say('Under 2 min')}
          </li>
          <li>
            <i style={{ background: callColor(3) }} />
            {say('2 to 5 min')}
          </li>
          <li>
            <i style={{ background: callColor(6) }} />
            {say('Over 5 min')}
          </li>
        </ul>
      ) : (
        <div className="ramp">
          <span className="ramp__bar" dir="ltr" style={{ background: `linear-gradient(90deg, ${(layer === 'temp' ? TEMP_STOPS : AIR_STOPS).join(', ')})` }} />
          <span className="ramp__labels num" dir="ltr">
            {(layer === 'temp' ? [say('{v} °C', { v: 19 }), '22.5', say('{v} °C', { v: 26.5 })] : [say('{v} ppm', { v: 420 }), '860', say('{v} ppm', { v: '1,300' })]).map((l) => (
              <span key={l}>{l}</span>
            ))}
          </span>
        </div>
      )}
    </div>
  )
}

/** Play, the clock, and the day's track with its alerts marked; replay only, as the clinic has no feed. */
function ClinicTimeline() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const playing = useWard((s) => s.playing)
  const speed = useWard((s) => s.speed)
  const setT = useWard((s) => s.setT)
  const setPlaying = useWard((s) => s.setPlaying)
  const setSpeed = useWard((s) => s.setSpeed)
  return (
    <footer className="timeline" dir="ltr">
      <button
        className="play"
        onClick={() => {
          if (!playing && t >= 1435) setT(0)
          setPlaying(!playing)
        }}
        aria-label={playing ? say('Pause the replay') : say('Play the day')}
        disabled={!day}
      >
        {playing ? <Pause size={18} strokeWidth={2} aria-hidden="true" /> : <Play size={18} strokeWidth={2} aria-hidden="true" />}
      </button>
      <output className="clock num" aria-live="off">
        {clock(t)}
      </output>
      <div className="track">
        <div className="track__hours" aria-hidden="true">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        <div className="track__rail" aria-hidden="true">
          <span className="track__fill" style={{ width: `${(t / 1440) * 100}%` }} />
          {(day?.alerts ?? []).map((a) => (
            <i key={a.id} className="track__mark" style={{ left: `${(a.from / 1440) * 100}%`, background: SEVERITY[a.severity] }} title={`${clock(a.from)} ${alertTitle(a)} ${a.target.id}`} />
          ))}
        </div>
        <input
          className="track__input"
          type="range"
          min={0}
          max={1439}
          step={5}
          value={Math.round(t)}
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
          aria-label={say('Time of day')}
          aria-valuetext={clock(t)}
          disabled={!day}
        />
      </div>
      <div className="timeline__end">
        <div className="seg seg--small" role="radiogroup" aria-label={say('Replay speed')}>
          {SPEEDS.map((s) => (
            <button key={s} role="radio" aria-checked={speed === s} className="seg__btn" onClick={() => setSpeed(s)} aria-label={plural(s, '{n} simulated minute per second', '{n} simulated minutes per second')}>
              <span className="num">{s === 60 ? say('1 h/s') : say('{n} min/s', { n: s })}</span>
            </button>
          ))}
        </div>
      </div>
    </footer>
  )
}

/** What a room's tag says in a layer at minute t. */
function reading(room: BuildingSpace, layer: Layer) {
  const { day, t } = useWard.getState()
  if (!day) return ''
  const env = day.rooms[room.id]
  if (layer === 'temp') return say('{v} °C', { v: sample(env.temp, t).toFixed(1) })
  if (layer === 'air') return say('{v} ppm CO₂', { v: Math.round(sample(env.co2, t)).toLocaleString('en-US') })
  if (layer === 'calls') {
    const call = activeCall(day, room.id, t)
    return call ? say('Call light, {n} min', { n: Math.max(0, t - call.at).toFixed(0) }) : say('No call light')
  }
  const bed = bedAt(day, room.id, t)
  return bed ? bedLabel(bed.state) : room.name
}

/** The label beside the hovered or selected room, and with both floors on show, each floor's name; placed from the scene. */
function ClinicTags({ building }: { building: Building }) {
  const hover = useWard((s) => s.hover)
  const selection = useWard((s) => s.selection)
  const layer = useWard((s) => s.layer)
  const view = useWard((s) => s.view)
  useWard((s) => s.t)
  const floors = useClinic((s) => s.floors)
  const spread = useClinic((s) => s.spread)
  const ids = [...new Set([selection?.id, hover].filter((x): x is string => !!x))]
  const y = view === 'plan' ? 0.3 : WALL + 0.4
  return (
    <div className="tags" aria-hidden="true">
      {floors === 'all' &&
        building.storeys.map((storey, i) => {
          const off = floorOffset(building, i, floors, spread)
          return (
            <Tag key={`floor-${i}`} slot={`clinic-floor-${i}`} x={off.x + building.size.w / 2} y={0} z={off.z - 2.5}>
              <span className="tag__id">{floorName(storey.name)}</span>
            </Tag>
          )
        })}
      {ids.map((id) => {
        const room = building.spaces.find((s) => s.id === id)
        if (!room || !shows(room, floors)) return null
        const off = floorOffset(building, room.storey, floors, spread)
        return (
          <Tag key={id} slot={`clinic-${id}`} x={room.label[0] + off.x} y={y} z={room.label[1] + off.z} strong={id === selection?.id}>
            <span className="tag__id">{room.id}</span>
            <span className="tag__meta">{reading(room, layer)}</span>
          </Tag>
        )
      })}
    </div>
  )
}

function Tag({ slot, x, y, z, strong, children }: { slot: string; x: number; y: number; z: number; strong?: boolean; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (el.current) setAnchor(slot, { el: el.current, x, y, z })
  }, [slot, x, y, z])
  useLayoutEffect(() => () => setAnchor(slot, null), [slot])
  return (
    <div ref={el} className={`tag${strong ? ' tag--strong' : ''}`} style={{ visibility: 'hidden' }}>
      {children}
    </div>
  )
}
