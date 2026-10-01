import { ROOMS, ROOM_BY_ID } from '../data/floorplan'
import type { Alert, Asset, Day, RoomDay } from '../data/types'
import { DAY_MIN, STEP } from '../sim/time'
import type { Stamped, WardEvent } from './protocol'

/*
  The live feed is the simulated day told as events. toEvents is the mock
  server's side: it turns a whole day into the log it publishes, minute by
  minute. applyEvents is the page's side: it folds events into the same Day
  the views already read, so no view needs to know where its day came from.
  Anything still going on (a bed's current state, a call light that is on,
  an open alert, a patient waiting for a bed) ends at Infinity until an
  event closes it.
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
  for (const r of day.requests) {
    add(r.at, { kind: 'bed-request', id: r.id, wing: r.wing, waiting: true })
    add(r.admitted, { kind: 'bed-request', id: r.id, wing: r.wing, waiting: false, room: r.room })
  }
  for (const p of day.plans) add(p.at, { kind: 'discharge-plan', room: p.room, eta: p.eta })
  for (const { at, ...action } of day.actions) add(at, { kind: 'alert-action', action })
  // Array sort is stable, so the order above holds within each minute.
  return log.sort((a, b) => a.at - b.at).map((e, seq) => ({ ...e, seq }))
}

export function emptyDay(seed: number): Day {
  const rooms: Record<string, RoomDay> = {}
  for (const r of ROOMS) rooms[r.id] = { spans: [], temp: [], co2: [] }
  return { seed, rooms, calls: [], assets: [], alerts: [], requests: [], plans: [], actions: [] }
}

/**
  Folds events into a new day. The day passed in is never changed: a batch
  copies each array it touches once, the first time it touches it, and
  shares everything else. Equipment, calls and alerts are found through
  maps built for the batch, since a hospital's day holds thousands of each.
*/
export function applyEvents(day: Day, events: Stamped[]): Day {
  const rooms = { ...day.rooms }
  const assets = [...day.assets]
  const calls = [...day.calls]
  const alerts = [...day.alerts]
  const requests = [...day.requests]
  const plans = [...day.plans]
  const actions = [...day.actions]
  const fresh = new Set<unknown[]>()
  const own = <T,>(list: T[]): T[] => {
    if (fresh.has(list)) return list
    const copy = list.slice()
    fresh.add(copy)
    return copy
  }

  const spansOf = (id: string) => {
    const r = rooms[id]
    if (!r) return undefined
    if (!fresh.has(r.spans)) rooms[id] = { ...r, spans: own(r.spans) }
    return rooms[id].spans
  }
  const readingsOf = (id: string) => {
    const r = rooms[id]
    if (!r) return undefined
    if (!fresh.has(r.temp)) rooms[id] = { ...r, temp: own(r.temp), co2: own(r.co2) }
    return rooms[id]
  }

  let assetIndex: Map<string, number> | undefined
  const indexOf = (id: string) => (assetIndex ??= new Map(assets.map((a, i) => [a.id, i]))).get(id)
  const assetSpansOf = (id: string) => {
    const i = indexOf(id)
    if (i === undefined) return undefined
    const a = assets[i]
    if (!fresh.has(a.spans)) assets[i] = { ...a, spans: own(a.spans) }
    return assets[i].spans
  }
  const batteryOf = (id: string) => {
    const i = indexOf(id)
    const a = i === undefined ? undefined : assets[i]
    if (!a?.battery) return undefined
    if (!fresh.has(a.battery)) assets[i!] = { ...a, battery: own(a.battery) }
    return assets[i!].battery
  }

  // First match wins, as a search from the start would.
  const firstIndex = <T,>(list: T[], key: (x: T) => string) => {
    const map = new Map<string, number>()
    list.forEach((x, i) => map.has(key(x)) || map.set(key(x), i))
    return map
  }
  const callKey = (c: { room: string; at: number }) => `${c.room}|${c.at}`
  let callIndex: Map<string, number> | undefined
  let alertIndex: Map<string, number> | undefined
  let requestIndex: Map<string, number> | undefined
  let actionIds: Set<string> | undefined

  const end = <T extends { to: number }>(list: T[], at: number) => {
    const last = list[list.length - 1]
    if (last?.to === Infinity) list[list.length - 1] = { ...last, to: at }
  }

  for (const e of events) {
    switch (e.kind) {
      case 'bed': {
        const spans = spansOf(e.room)
        if (!spans) break
        end(spans, e.at)
        spans.push({ from: e.at, to: Infinity, state: e.state, acuity: e.acuity, note: e.note })
        break
      }
      case 'asset': {
        let spans = assetSpansOf(e.id)
        if (!spans) {
          // Equipment never leaves its wing, so the first room it is seen in names it.
          const a: Asset = { id: e.id, kind: e.assetKind, wing: ROOM_BY_ID[e.loc]?.wing ?? '', spans: [], ...(e.assetKind === 'pump' && { battery: [] }) }
          assets.push(a)
          assetIndex?.set(a.id, assets.length - 1)
          fresh.add(a.spans)
          if (a.battery) fresh.add(a.battery)
          spans = a.spans
        }
        end(spans, e.at)
        spans.push({ from: e.at, to: Infinity, loc: e.loc, status: e.status })
        break
      }
      case 'readings':
        for (const id in e.temp) {
          const r = readingsOf(id)
          if (!r) continue
          r.temp[e.slot] = e.temp[id]
          r.co2[e.slot] = e.co2[id]
        }
        for (const id in e.battery) {
          const battery = batteryOf(id)
          if (battery) battery[e.slot] = e.battery[id]
        }
        break
      case 'call':
        if (e.on) {
          calls.push({ room: e.room, at: e.pressed, wait: Infinity })
          const key = callKey({ room: e.room, at: e.pressed })
          if (callIndex && !callIndex.has(key)) callIndex.set(key, calls.length - 1)
        } else {
          const i = (callIndex ??= firstIndex(calls, callKey)).get(callKey({ room: e.room, at: e.pressed }))
          if (i !== undefined) calls[i] = { ...calls[i], wait: e.at - e.pressed }
        }
        break
      case 'alert-open':
        alerts.push({ ...e.alert, to: Infinity } satisfies Alert)
        if (alertIndex && !alertIndex.has(e.alert.id)) alertIndex.set(e.alert.id, alerts.length - 1)
        break
      case 'alert-close': {
        const i = (alertIndex ??= firstIndex(alerts, (a) => a.id)).get(e.id)
        if (i !== undefined) alerts[i] = { ...alerts[i], to: e.at }
        break
      }
      case 'bed-request':
        if (e.waiting) {
          requests.push({ id: e.id, wing: e.wing, at: e.at, admitted: Infinity })
          if (requestIndex && !requestIndex.has(e.id)) requestIndex.set(e.id, requests.length - 1)
        } else {
          const i = (requestIndex ??= firstIndex(requests, (r) => r.id)).get(e.id)
          if (i !== undefined) requests[i] = { ...requests[i], admitted: e.at, room: e.room }
        }
        break
      case 'discharge-plan':
        plans.push({ room: e.room, at: e.at, eta: e.eta })
        break
      case 'alert-action':
        // A server logs an action once; a screen that hears it twice still counts it once.
        if ((actionIds ??= new Set(actions.map((a) => a.id))).has(e.action.id)) break
        actionIds.add(e.action.id)
        actions.push({ ...e.action, at: e.at })
        break
    }
  }
  return { seed: day.seed, rooms, calls, assets, alerts, requests, plans, actions }
}
