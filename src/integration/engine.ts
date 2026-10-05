import type { Alert, AssetKind, AssetStatus, BedState } from '../data/types'
import type { Timed } from '../live/hub'
import { ALERT_TITLE } from '../lib/alerts'
import { LIMIT } from '../data/limits'
import { STEP } from '../sim/time'
import { HOSPITAL_SITE, type Site } from './sites'
import type { BedStatus, FlowRequest, NurseCall, Reading, RoundPlan, TagReport, Telemetry } from './topics'

/*
  The integration server's engine: the hospital's raw messages in
  (topics.ts), the feed's events out. Changes pass through as events once
  checked. Readings are gathered and go out every five minutes as one frame,
  each room at its latest value. And the alerts are worked out here, by the
  same rules and limits the simulation uses, from what has arrived and
  nothing else: an alert opens at the minute the data first shows it, and
  closes when the data shows it over.

  Rules on readings run when a frame goes out; rules on time (a call light
  waiting, a bed left dirty or a clean one left empty) run on every clock
  message, after everything up to that minute. An engine serves one site
  (sites.ts): the hospital, or the clinic, which flags no turnover. A message
  that names no room the site knows, or carries no minute, is counted and
  dropped.
*/

const STATES = new Set<BedState>(['occupied', 'dirty', 'cleaning', 'ready', 'blocked'])
const KINDS = new Set<AssetKind>(['pump', 'vent', 'chair', 'xray', 'scanner'])
const STATUSES = new Set<AssetStatus>(['in-use', 'available', 'needs-cleaning', 'charging'])
const isNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

type Opening = Omit<Alert, 'to' | 'title'>

export function createEngine(site: Site = HOSPITAL_SITE) {
  const isRoom = (id: unknown): id is string => typeof id === 'string' && site.rooms.has(id)
  const env = new Map<string, { temp: number; co2: number }>()
  const battery = new Map<string, number>()
  const beds = new Map<string, { state: BedState; acuity?: number; note?: string; since: number }>()
  const assets = new Map<string, { kind: AssetKind; loc: string; status: AssetStatus }>()
  /** Call lights on, by room and the minute pressed. */
  const calls = new Map<string, { room: string; pressed: number }>()
  /** Stale air: where a run of high readings started, and how long it is. */
  const stale = new Map<string, { start: number; readings: number }>()
  /** Open alerts by the condition they are about, such as `temp:4A09`. */
  const open = new Map<string, string>()
  let dropped = 0

  const openAlert = (key: string, a: Opening): Timed[] => {
    if (open.has(key)) return []
    open.set(key, a.id)
    return [{ kind: 'alert-open', alert: { ...a, title: ALERT_TITLE[a.kind] }, at: a.from }]
  }
  const closeAlert = (key: string, at: number): Timed[] => {
    const id = open.get(key)
    if (id === undefined) return []
    open.delete(key)
    return [{ kind: 'alert-close', id, at }]
  }
  const drop = (): Timed[] => {
    dropped++
    return []
  }

  /** The rules that read the five-minute readings, and the frame that carries them. */
  function readings(m: number): Timed[] {
    const slot = m / STEP
    const out: Timed[] = []
    if (env.size || battery.size) {
      out.push({
        kind: 'readings',
        slot,
        temp: Object.fromEntries([...env].map(([room, r]) => [room, r.temp])),
        co2: Object.fromEntries([...env].map(([room, r]) => [room, r.co2])),
        battery: Object.fromEntries(battery),
        at: m,
      })
    }
    for (const [room, r] of env) {
      const target = { type: 'room', id: room } as const
      if (r.temp > LIMIT.temp) out.push(...openAlert(`temp:${room}`, { id: `temp-${room}-${m}`, kind: 'temp', from: m, since: m, severity: 'warning', target }))
      else out.push(...closeAlert(`temp:${room}`, m))
      if (r.co2 > LIMIT.co2) {
        const run = stale.get(room) ?? { start: m, readings: 0 }
        run.readings++
        stale.set(room, run)
        if (run.readings >= LIMIT.co2Readings) out.push(...openAlert(`co2:${room}`, { id: `co2-${room}-${m}`, kind: 'co2', from: m, since: run.start, severity: 'warning', target }))
      } else {
        stale.delete(room)
        out.push(...closeAlert(`co2:${room}`, m))
      }
    }
    for (const [id, charge] of battery) {
      if (assets.get(id)?.status === 'in-use' && charge < LIMIT.battery) {
        out.push(...openAlert(`batt:${id}`, { id: `batt-${id}-${slot}`, kind: 'battery', from: m, since: m, severity: 'warning', target: { type: 'asset', id } }))
      } else out.push(...closeAlert(`batt:${id}`, m))
    }
    return out
  }

  /** The rules on time, at minute m. Each opens at the minute its limit was passed. */
  function waiting(m: number): Timed[] {
    const out: Timed[] = []
    for (const [key, { room, pressed }] of calls) {
      const from = pressed + LIMIT.call
      if (m >= from) out.push(...openAlert(`call:${key}`, { id: `call-${room}-${pressed}`, kind: 'call', from, since: pressed, severity: 'warning', target: { type: 'room', id: room } }))
    }
    for (const [room, bed] of site.turnover ? beds : []) {
      const target = { type: 'room', id: room } as const
      if (bed.state === 'dirty' && m >= bed.since + LIMIT.dirty) {
        out.push(...openAlert(`dirty:${room}`, { id: `dirty-${room}-${bed.since}`, kind: 'dirty', from: bed.since + LIMIT.dirty, since: bed.since, severity: 'warning', target }))
      }
      // A bed ready since before midnight was not left empty by anyone today.
      if (bed.state === 'ready' && bed.since > 0 && m >= bed.since + LIMIT.ready) {
        out.push(...openAlert(`ready:${room}`, { id: `ready-${room}-${bed.since}`, kind: 'ready', from: bed.since + LIMIT.ready, since: bed.since, severity: 'info', target }))
      }
    }
    return out
  }

  /** Takes one message and returns the events it makes, if any. */
  function ingest(t: string, payload: unknown): Timed[] {
    const p = payload as Record<string, unknown> | null
    if (!p || !isNumber(p.at) || !t.startsWith(`${site.root}/`)) return drop()
    const at = p.at
    const [system, part, id] = t.slice(site.root.length + 1).split('/')
    switch (system) {
      case 'bms': {
        const r = p as unknown as Reading
        if (!isRoom(part) || !isNumber(r.temp) || !isNumber(r.co2)) return drop()
        env.set(part, { temp: r.temp, co2: r.co2 })
        return []
      }
      case 'telemetry': {
        const r = p as unknown as Telemetry
        if (!isNumber(r.battery)) return drop()
        battery.set(part, r.battery)
        return []
      }
      case 'beds': {
        const b = p as unknown as BedStatus
        if (!isRoom(part) || !STATES.has(b.state)) return drop()
        const was = beds.get(part)
        // A system that says the same thing again has not changed anything.
        if (was && was.state === b.state && was.acuity === b.acuity && was.note === b.note) return []
        beds.set(part, { state: b.state, acuity: b.acuity, note: b.note, since: at })
        return [...closeAlert(`dirty:${part}`, at), ...closeAlert(`ready:${part}`, at), { kind: 'bed', room: part, state: b.state, acuity: b.acuity, note: b.note, at }]
      }
      case 'nursecall': {
        const c = p as unknown as NurseCall
        if (!isRoom(part) || typeof c.on !== 'boolean' || !isNumber(c.pressed)) return drop()
        const key = `${part}|${c.pressed}`
        const closed = c.on ? [] : closeAlert(`call:${key}`, at)
        if (c.on) calls.set(key, { room: part, pressed: c.pressed })
        else calls.delete(key)
        return [...closed, { kind: 'call', room: part, pressed: c.pressed, on: c.on, at }]
      }
      case 'rtls': {
        const a = p as unknown as TagReport
        if (!part || !KINDS.has(a.kind) || !STATUSES.has(a.status) || !isRoom(a.loc)) return drop()
        assets.set(part, { kind: a.kind, loc: a.loc, status: a.status })
        return [{ kind: 'asset', id: part, assetKind: a.kind, loc: a.loc, status: a.status, at }]
      }
      case 'flow': {
        if (part === 'request') {
          const r = p as unknown as FlowRequest
          if (!id || typeof r.wing !== 'string' || typeof r.waiting !== 'boolean') return drop()
          return [{ kind: 'bed-request', id, wing: r.wing, waiting: r.waiting, ...(r.room !== undefined && { room: r.room }), at }]
        }
        if (part === 'plan') {
          const r = p as unknown as RoundPlan
          if (!isRoom(id) || !isNumber(r.eta)) return drop()
          return [{ kind: 'discharge-plan', room: id, eta: r.eta, at }]
        }
        return drop()
      }
      case 'clock':
        return [...(at % STEP === 0 ? readings(at) : []), ...waiting(at)]
      default:
        return drop()
    }
  }

  return {
    ingest,
    /** How many messages were dropped as malformed or about something the site does not know. */
    get dropped() {
      return dropped
    },
  }
}
