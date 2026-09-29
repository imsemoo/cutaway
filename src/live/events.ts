import { ROOMS } from '../data/floorplan'
import type { Alert, Asset, Day, RoomDay } from '../data/types'
import { DAY_MIN, STEP } from '../sim/time'
import type { Stamped, WardEvent } from './protocol'

/*
  The live feed is the simulated day told as events. toEvents is the mock
  server's side: it turns a whole day into the log it publishes, minute by
  minute. applyEvents is the page's side: it folds events into the same Day
  the views already read, so no view needs to know where its day came from.
  Anything still going on (a bed's current state, a call light that is on,
  an open alert) ends at Infinity until an event closes it.
*/

export function toEvents(day: Day): Stamped[] {
  const log: (WardEvent & { at: number })[] = []
  const add = (at: number, e: WardEvent) => {
    if (at < DAY_MIN) log.push({ ...e, at })
  }

  // Within a minute events keep this order, so an asset exists before its first battery reading.
  for (const [room, { spans }] of Object.entries(day.rooms)) {
    for (const s of spans) add(s.from, { kind: 'bed', room, state: s.state, acuity: s.acuity, note: s.note })
  }
  for (const a of day.assets) {
    for (const s of a.spans) add(s.from, { kind: 'asset', id: a.id, assetKind: a.kind, loc: s.loc, status: s.status })
  }
  for (let slot = 0; slot * STEP < DAY_MIN; slot++) {
    const temp: Record<string, number> = {}
    const co2: Record<string, number> = {}
    const battery: Record<string, number> = {}
    for (const [id, r] of Object.entries(day.rooms)) {
      temp[id] = r.temp[slot]
      co2[id] = r.co2[slot]
    }
    for (const a of day.assets) if (a.battery) battery[a.id] = a.battery[slot]
    add(slot * STEP, { kind: 'readings', slot, temp, co2, battery })
  }
  for (const c of day.calls) {
    add(c.at, { kind: 'call', room: c.room, pressed: c.at, on: true })
    add(c.at + c.wait, { kind: 'call', room: c.room, pressed: c.at, on: false })
  }
  for (const { to, ...alert } of day.alerts) {
    // An alert opens with only what is known then; how bad a warm room or a waiting call gets is read as it happens.
    const severity = alert.kind === 'temp' || alert.kind === 'call' ? 'warning' : alert.severity
    add(alert.from, { kind: 'alert-open', alert: { ...alert, severity } })
    add(to, { kind: 'alert-close', id: alert.id })
  }
  // Array sort is stable, so the order above holds within each minute.
  return log.sort((a, b) => a.at - b.at).map((e, seq) => ({ ...e, seq }))
}

export function emptyDay(seed: number): Day {
  const rooms: Record<string, RoomDay> = {}
  for (const r of ROOMS) rooms[r.id] = { spans: [], temp: [], co2: [] }
  return { seed, rooms, calls: [], assets: [], alerts: [] }
}

/** Folds events into a new day. The day passed in is never changed, and whatever a batch does not touch is shared with it. */
export function applyEvents(day: Day, events: Stamped[]): Day {
  const rooms = { ...day.rooms }
  const assets = [...day.assets]
  const calls = [...day.calls]
  const alerts = [...day.alerts]
  const copied = new Set<RoomDay | Asset>()

  const room = (id: string) => {
    const r = rooms[id]
    if (!r || copied.has(r)) return r
    const copy = (rooms[id] = { spans: [...r.spans], temp: [...r.temp], co2: [...r.co2] })
    copied.add(copy)
    return copy
  }
  const asset = (id: string) => {
    const i = assets.findIndex((a) => a.id === id)
    if (i < 0 || copied.has(assets[i])) return assets[i]
    const a = assets[i]
    const copy = (assets[i] = { ...a, spans: [...a.spans], ...(a.battery && { battery: [...a.battery] }) })
    copied.add(copy)
    return copy
  }
  const end = <T extends { to: number }>(list: T[], at: number) => {
    const last = list[list.length - 1]
    if (last?.to === Infinity) list[list.length - 1] = { ...last, to: at }
  }

  for (const e of events) {
    switch (e.kind) {
      case 'bed': {
        const r = room(e.room)
        if (!r) break
        end(r.spans, e.at)
        r.spans.push({ from: e.at, to: Infinity, state: e.state, acuity: e.acuity, note: e.note })
        break
      }
      case 'asset': {
        let a = asset(e.id)
        if (!a) {
          a = { id: e.id, kind: e.assetKind, spans: [], ...(e.assetKind === 'pump' && { battery: [] }) }
          assets.push(a)
          copied.add(a)
        }
        end(a.spans, e.at)
        a.spans.push({ from: e.at, to: Infinity, loc: e.loc, status: e.status })
        break
      }
      case 'readings':
        for (const id in e.temp) {
          const r = room(id)
          if (!r) continue
          r.temp[e.slot] = e.temp[id]
          r.co2[e.slot] = e.co2[id]
        }
        for (const id in e.battery) {
          const a = asset(id)
          if (a?.battery) a.battery[e.slot] = e.battery[id]
        }
        break
      case 'call':
        if (e.on) {
          calls.push({ room: e.room, at: e.pressed, wait: Infinity })
        } else {
          const i = calls.findIndex((c) => c.room === e.room && c.at === e.pressed)
          if (i >= 0) calls[i] = { ...calls[i], wait: e.at - e.pressed }
        }
        break
      case 'alert-open':
        alerts.push({ ...e.alert, to: Infinity } satisfies Alert)
        break
      case 'alert-close': {
        const i = alerts.findIndex((a) => a.id === e.id)
        if (i >= 0) alerts[i] = { ...alerts[i], to: e.at }
        break
      }
    }
  }
  return { seed: day.seed, rooms, calls, assets, alerts }
}
