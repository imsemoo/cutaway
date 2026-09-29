import { BED_ROOMS, ROOMS } from '../data/floorplan'
import type { Alert, Asset, AssetKind, AssetSpan, AssetStatus, BedSpan, CallEvent, Day, RoomDay } from '../data/types'

/*
  One simulated day on the ward, generated from a fixed seed so every
  visitor replays the same day. Nothing here is real patient data.

  The story the day tells, by design:
  - discharges cluster late morning, admissions from ED in the evening,
    so beds sit dirty, then in cleaning, then ready and waiting;
  - an HVAC fault warms 4A09 through the afternoon;
  - the family lounge gets stuffy in evening visiting hours;
  - one infusion pump runs low on battery until a nurse plugs it in;
  - call lights wait longer at shift handover.
*/

import { DAY_MIN, SAMPLES, STEP } from './time'

const hm = (h: number, m = 0) => h * 60 + m

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const bump = (m: number, at: number, width: number) => Math.exp(-((m - at) ** 2) / (2 * width * width))
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The seed of the day every visitor replays, and the live feed streams. */
export const SEED = 20260928

export function simulate(seed = SEED): Day {
  const rnd = mulberry32(seed)
  const rand = (a: number, b: number) => a + (b - a) * rnd()
  const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))

  /* ---------- 1. Beds ---------- */

  const spans: Record<string, BedSpan[]> = {}
  const push = (id: string, s: BedSpan) => (spans[id] ??= []).push(s)
  const general = BED_ROOMS.filter((r) => r.kind === 'patient').map((r) => r.id)
  const icu = BED_ROOMS.filter((r) => r.kind === 'icu').map((r) => r.id)

  const generalAcuity = () => (rnd() < 0.3 ? 1 : rnd() < 0.72 ? 2 : 3)

  // Scripted rooms first.
  push('4B07', { from: 0, to: DAY_MIN, state: 'blocked', note: 'Out of service: leak under the basin, repair booked for tomorrow' })
  push('4A09', { from: 0, to: DAY_MIN, state: 'occupied', acuity: 2 })
  // Cleaned overnight, admitted after breakfast.
  push('4A11', { from: 0, to: hm(6, 10), state: 'dirty' })
  push('4A11', { from: hm(6, 10), to: hm(6, 55), state: 'cleaning' })
  push('4A11', { from: hm(6, 55), to: hm(8, 20), state: 'ready' })
  push('4A11', { from: hm(8, 20), to: DAY_MIN, state: 'occupied', acuity: 2 })
  // Held empty for the ICU step-down transfer.
  push('4A03', { from: 0, to: hm(11, 25), state: 'ready' })
  push('4A03', { from: hm(11, 25), to: DAY_MIN, state: 'occupied', acuity: 3, note: 'Transferred from ICU bay 4C02' })
  // Ready overnight, admitted from ED in the morning.
  push('4B02', { from: 0, to: hm(9, 10), state: 'ready' })
  push('4B02', { from: hm(9, 10), to: DAY_MIN, state: 'occupied', acuity: 2, note: 'Admitted from ED' })

  const scripted = new Set(['4B07', '4A09', '4A11', '4A03', '4B02'])
  const pool = general.filter((id) => !scripted.has(id))
  // Shuffle deterministically, then take eight discharges.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const discharges = [
    { t: hm(10, 5), wait: 25, clean: 40 },
    { t: hm(10, 40), wait: 40, clean: 45 },
    { t: hm(11, 20), wait: 30, clean: 40 },
    { t: hm(11, 55), wait: 50, clean: 45 },
    { t: hm(12, 30), wait: 35, clean: 40 },
    { t: hm(13, 15), wait: 80, clean: 45 },
    { t: hm(13, 50), wait: 30, clean: 40 },
    { t: hm(14, 5), wait: 45, clean: 40 },
  ]
  const admissions = [hm(11, 45), hm(12, 50), hm(13, 40), hm(15, 10), hm(16, 5), hm(17, 20), hm(18, 40), hm(20, 30)]
  const readyAt: { id: string; at: number }[] = []

  discharges.forEach((d, i) => {
    const id = pool[i]
    push(id, { from: 0, to: d.t, state: 'occupied', acuity: generalAcuity(), note: 'Discharged home' })
    push(id, { from: d.t, to: d.t + d.wait, state: 'dirty' })
    push(id, { from: d.t + d.wait, to: d.t + d.wait + d.clean, state: 'cleaning' })
    readyAt.push({ id, at: d.t + d.wait + d.clean })
  })
  readyAt.sort((a, b) => a.at - b.at)
  admissions.forEach((t, i) => {
    const bed = readyAt[i]
    const admit = Math.max(t, bed.at + 10)
    push(bed.id, { from: bed.at, to: admit, state: 'ready' })
    push(bed.id, { from: admit, to: DAY_MIN, state: 'occupied', acuity: generalAcuity(), note: 'Admitted from ED' })
  })
  for (const id of pool.slice(discharges.length)) {
    push(id, { from: 0, to: DAY_MIN, state: 'occupied', acuity: generalAcuity() })
  }

  // ICU: one step-down transfer, one bed held for an ED admission.
  for (const id of icu) {
    if (id === '4C02') {
      push(id, { from: 0, to: hm(11, 10), state: 'occupied', acuity: 3, note: 'Stepped down to ward room 4A03' })
      push(id, { from: hm(11, 10), to: hm(11, 40), state: 'dirty' })
      push(id, { from: hm(11, 40), to: hm(12, 35), state: 'cleaning' })
      push(id, { from: hm(12, 35), to: hm(19, 40), state: 'ready' })
      push(id, { from: hm(19, 40), to: DAY_MIN, state: 'occupied', acuity: 4, note: 'Admitted from theatre' })
    } else if (id === '4C05') {
      push(id, { from: 0, to: hm(16, 40), state: 'ready' })
      push(id, { from: hm(16, 40), to: DAY_MIN, state: 'occupied', acuity: 4, note: 'Admitted from ED' })
    } else {
      push(id, { from: 0, to: DAY_MIN, state: 'occupied', acuity: rnd() < 0.55 ? 4 : 3 })
    }
  }
  for (const id of Object.keys(spans)) spans[id].sort((a, b) => a.from - b.from)

  const stateAt = (id: string, m: number) => spans[id]?.find((s) => m >= s.from && m < s.to)

  /* ---------- 2. Room environment ---------- */

  const rooms: Record<string, RoomDay> = {}
  for (const room of ROOMS) {
    const base =
      room.kind === 'icu' ? 21.3 : room.kind === 'station' ? 23.0 : room.kind === 'support' || room.kind === 'core' ? 22.8 : room.kind === 'lounge' ? 22.6 : rand(22.0, 22.9)
    const temp: number[] = []
    const co2: number[] = []
    let tn = 0
    let cn = 0
    const visitors = rand(80, 320)
    for (let s = 0; s < SAMPLES; s++) {
      const m = s * STEP
      tn = tn * 0.9 + (rnd() - 0.5) * 0.12
      cn = cn * 0.85 + (rnd() - 0.5) * 22
      let t = base + 0.45 * Math.sin((2 * Math.PI * (m - hm(9))) / DAY_MIN) + tn
      if (room.id === '4A09') {
        // HVAC fault from 12:10, fixed at 17:40.
        const rise = smoothstep(hm(12, 10), hm(15, 20), m) * 4.4
        const fall = m > hm(17, 40) ? Math.exp(-(m - hm(17, 40)) / 45) : 1
        t += rise * fall
      }
      temp.push(Math.round(t * 10) / 10)

      const occ = stateAt(room.id, m)?.state === 'occupied'
      let c = 420 + cn
      if (room.kind === 'patient' || room.kind === 'icu') {
        c += occ ? 170 : 20
        if (occ && room.kind === 'patient') c += bump(m, hm(17, 30), 110) * visitors + bump(m, hm(12, 30), 70) * visitors * 0.4
      } else if (room.kind === 'station') {
        c += 140 + bump(m, hm(7, 15), 25) * 260 + bump(m, hm(19, 15), 25) * 260
      } else if (room.kind === 'lounge') {
        c += 60 + bump(m, hm(18, 0), 95) * 830 + bump(m, hm(13, 0), 80) * 310
      } else {
        c += 40
      }
      co2.push(Math.round(c))
    }
    rooms[room.id] = { spans: spans[room.id] ?? [], temp, co2 }
  }

  /* ---------- 3. Call lights ---------- */

  const calls: CallEvent[] = []
  const busy = (m: number) => 1 + bump(m, hm(7, 15), 20) * 1.6 + bump(m, hm(19, 15), 20) * 1.6 + bump(m, hm(12, 15), 60) * 0.5
  for (const room of BED_ROOMS) {
    for (let m = 0; m < DAY_MIN; m += STEP) {
      const s = stateAt(room.id, m)
      if (s?.state !== 'occupied') continue
      const perHour = (room.kind === 'icu' ? 0.05 : 0.12) + 0.05 * (s.acuity ?? 1) + (m > hm(6) && m < hm(22) ? 0.06 : -0.04)
      if (rnd() < (perHour * STEP) / 60) {
        const wait = Math.min(14, Math.max(0.4, -Math.log(1 - rnd()) * 1.9 * busy(m)))
        calls.push({ room: room.id, at: m + randInt(0, 4), wait: Math.round(wait * 10) / 10 })
      }
    }
  }
  // A long wait during the afternoon rush, so the default view has one.
  calls.push({ room: '4B04', at: hm(14, 21), wait: 11.5 })
  calls.sort((a, b) => a.at - b.at)

  /* ---------- 4. Equipment ---------- */

  const assets: Asset[] = []
  const add = (kind: AssetKind, prefix: string, n: number) => {
    for (let i = 1; i <= n; i++) assets.push({ id: `${prefix}-${String(i).padStart(2, '0')}`, kind, spans: [] })
  }
  add('pump', 'IVP', 18)
  add('vent', 'VEN', 4)
  add('chair', 'WCH', 6)
  add('xray', 'PXR', 1)
  add('scanner', 'BSC', 2)

  // Pumps and ventilators follow patients: stepped simulation.
  type Live = { loc: string; status: AssetStatus; until: number; battery: number; log: { m: number; loc: string; status: AssetStatus; battery: number }[] }
  const need = new Map<BedSpan, { pump: number; vent: number }>()
  for (const room of BED_ROOMS) {
    for (const s of spans[room.id] ?? []) {
      if (s.state !== 'occupied') continue
      const a = s.acuity ?? 1
      const pump = room.kind === 'icu' ? (a === 4 ? 2 : 1) : a === 3 ? 1 : a === 2 && rnd() < 0.3 ? 1 : 0
      need.set(s, { pump, vent: room.kind === 'icu' && a === 4 ? 1 : 0 })
    }
  }
  const live = new Map<string, Live>()
  for (const a of assets) {
    if (a.kind === 'pump' || a.kind === 'vent') {
      live.set(a.id, { loc: 'EQP', status: 'available', until: 0, battery: a.kind === 'pump' ? randInt(78, 100) : 100, log: [] })
    }
  }
  const byKind = (k: AssetKind) => assets.filter((a) => a.kind === k).map((a) => [a.id, live.get(a.id)!] as const)

  for (let m = 0; m < DAY_MIN; m += STEP) {
    for (const kind of ['pump', 'vent'] as const) {
      const list = byKind(kind)
      for (const [, st] of list) {
        if (st.status === 'needs-cleaning' && m >= st.until) {
          st.loc = 'EQP'
          st.status = 'charging'
        }
        if (st.status === 'charging' || st.status === 'available') {
          st.battery = Math.min(100, st.battery + 2.2)
          st.status = st.battery >= 96 ? 'available' : 'charging'
        }
        // A pump at the bedside runs on mains and tops up; one scripted pump below does not.
        if (st.status === 'in-use' && kind === 'pump') st.battery = Math.min(100, st.battery + 0.3)
      }
      for (const room of BED_ROOMS) {
        const s = stateAt(room.id, m)
        const wanted = s ? (need.get(s)?.[kind] ?? 0) : 0
        const here = list.filter(([, st]) => st.loc === room.id && st.status === 'in-use')
        for (let i = wanted; i < here.length; i++) {
          const st = here[i][1]
          st.loc = 'SOIL'
          st.status = 'needs-cleaning'
          st.until = m + (kind === 'vent' ? 70 : 45)
        }
        for (let i = here.length; i < wanted; i++) {
          const free = list
            .filter(([, st]) => st.loc === 'EQP' && (st.status === 'available' || (st.status === 'charging' && st.battery > 40)))
            .sort((a, b) => b[1].battery - a[1].battery)[0]
          if (!free) break
          free[1].loc = room.id
          free[1].status = 'in-use'
        }
      }
      for (const [, st] of list) st.log.push({ m, loc: st.loc, status: st.status, battery: Math.round(st.battery) })
    }
  }

  const compress = (log: { m: number; loc: string; status: AssetStatus }[]): AssetSpan[] => {
    const out: AssetSpan[] = []
    for (const e of log) {
      const last = out[out.length - 1]
      if (last && last.loc === e.loc && last.status === e.status) last.to = e.m + STEP
      else out.push({ from: e.m, to: e.m + STEP, loc: e.loc, status: e.status })
    }
    if (out.length) out[out.length - 1].to = DAY_MIN
    return out
  }
  for (const a of assets) {
    const st = live.get(a.id)
    if (!st) continue
    a.spans = compress(st.log)
    if (a.kind === 'pump') a.battery = [...st.log.map((e) => e.battery), st.log[st.log.length - 1].battery]
  }

  // The low-battery pump: the one in use longest across 14:30.
  const lowPump = assets
    .filter((a) => a.kind === 'pump')
    .map((a) => ({ a, span: a.spans.find((s) => s.status === 'in-use' && s.from <= hm(12) && s.to > hm(15, 30)) }))
    .filter((x) => x.span)
    .sort((x, y) => x.span!.from - y.span!.from)[0]
  if (lowPump && lowPump.a.battery) {
    const plugIn = hm(15, 5)
    const crossing = hm(13, 25)
    const start = lowPump.span!.from
    const drain = 0.45
    for (let s = 0; s < SAMPLES; s++) {
      const m = s * STEP
      if (m < start || m >= lowPump.span!.to) continue
      const b = m < plugIn ? 20 + ((crossing - m) / STEP) * drain : 20 - ((plugIn - crossing) / STEP) * drain + ((m - plugIn) / STEP) * 1.3
      lowPump.a.battery[s] = Math.round(Math.max(3, Math.min(100, b)))
    }
  }

  // Event-driven equipment: wheelchairs, portable X-ray, bladder scanners.
  const busySpans = new Map<string, AssetSpan[]>()
  const book = (kind: AssetKind, from: number, to: number, steps: { loc: string; until: number }[]) => {
    const ids = assets.filter((a) => a.kind === kind).map((a) => a.id)
    const id = ids.find((x) => !(busySpans.get(x) ?? []).some((s) => s.from < to && from < s.to)) ?? ids[0]
    const list = busySpans.get(id) ?? []
    let t = from
    for (const step of steps) {
      list.push({ from: t, to: step.until, loc: step.loc, status: 'in-use' })
      t = step.until
    }
    busySpans.set(id, list)
  }
  discharges.forEach((d, i) => {
    book('chair', d.t - 20, d.t + 15, [
      { loc: pool[i], until: d.t },
      { loc: 'LIFT', until: d.t + 15 },
    ])
  })
  const xrayRounds: [string, number][] = [['4C01', hm(6, 10)], ['4C03', hm(6, 25)], ['4C04', hm(6, 40)], ['4C06', hm(6, 55)], ['4A05', hm(11, 30)], ['4B09', hm(16, 10)], ['4C05', hm(17, 5)]]
  for (const [loc, at] of xrayRounds) book('xray', at, at + 15, [{ loc, until: at + 15 }])
  const occupiedAt = (m: number) => BED_ROOMS.filter((r) => r.kind === 'patient' && stateAt(r.id, m)?.state === 'occupied').map((r) => r.id)
  for (let i = 0; i < 9; i++) {
    const at = randInt(hm(7), hm(21)) - (randInt(hm(7), hm(21)) % 5)
    const rooms = occupiedAt(at)
    const loc = rooms[randInt(0, rooms.length - 1)]
    book('scanner', at, at + 10, [{ loc, until: at + 10 }])
  }
  for (const a of assets) {
    if (a.kind === 'pump' || a.kind === 'vent') continue
    const home = a.kind === 'chair' ? 'LIFT' : 'EQP'
    const idle: AssetStatus = 'available'
    const busyList = (busySpans.get(a.id) ?? []).sort((x, y) => x.from - y.from)
    const out: AssetSpan[] = []
    let t = 0
    for (const s of busyList) {
      if (s.from > t) out.push({ from: t, to: s.from, loc: home, status: idle })
      out.push(s)
      t = s.to
    }
    if (t < DAY_MIN) out.push({ from: t, to: DAY_MIN, loc: home, status: idle })
    a.spans = out
  }

  /* ---------- 5. Alerts ---------- */

  // Alerts carry only facts known when they open; the interface words them at the replay minute.
  const alerts: Alert[] = []
  const above = (series: number[], limit: number, minSamples: number) => {
    const runs: [number, number][] = []
    let start = -1
    for (let s = 0; s <= SAMPLES; s++) {
      const high = s < SAMPLES && series[s] > limit
      if (high && start < 0) start = s
      if (!high && start >= 0) {
        if (s - start >= minSamples) runs.push([start * STEP, s * STEP])
        start = -1
      }
    }
    return runs
  }

  for (const room of ROOMS) {
    const env = rooms[room.id]
    for (const [from, to] of above(env.temp, 25.5, 1)) {
      const peak = Math.max(...env.temp.slice(from / STEP, to / STEP))
      alerts.push({
        id: `temp-${room.id}-${from}`, kind: 'temp', from, to, since: from,
        severity: peak > 26.5 ? 'critical' : 'warning',
        target: { type: 'room', id: room.id },
        title: 'Room too warm',
      })
    }
    for (const [from, to] of above(env.co2, 1000, 2)) {
      alerts.push({
        id: `co2-${room.id}-${from}`, kind: 'co2', from, to, since: from,
        severity: 'warning',
        target: { type: 'room', id: room.id },
        title: 'Air getting stale',
      })
    }
  }
  for (const c of calls) {
    if (c.wait <= 5) continue
    alerts.push({
      id: `call-${c.room}-${c.at}`, kind: 'call', from: c.at + 5, to: c.at + c.wait, since: c.at,
      severity: c.wait > 10 ? 'critical' : 'warning',
      target: { type: 'room', id: c.room },
      title: 'Call light unanswered',
    })
  }
  // Dirty beds waiting over an hour for cleaning, clean beds over two hours without a patient.
  for (const room of BED_ROOMS) {
    for (const s of spans[room.id] ?? []) {
      if (s.state === 'dirty' && s.to - s.from > 60) {
        alerts.push({
          id: `dirty-${room.id}-${s.from}`, kind: 'dirty', from: s.from + 60, to: s.to, since: s.from,
          severity: 'warning',
          target: { type: 'room', id: room.id },
          title: 'Bed waiting for cleaning',
        })
      }
      if (s.state === 'ready' && s.to - s.from > 120 && s.from > 0) {
        alerts.push({
          id: `ready-${room.id}-${s.from}`, kind: 'ready', from: s.from + 120, to: s.to, since: s.from,
          severity: 'info',
          target: { type: 'room', id: room.id },
          title: 'Clean bed not assigned',
        })
      }
    }
  }
  // Pump battery under 20 % while in use.
  for (const a of assets) {
    if (!a.battery) continue
    let start = -1
    for (let s = 0; s <= SAMPLES; s++) {
      const m = s * STEP
      const inUse = a.spans.some((sp) => sp.status === 'in-use' && m >= sp.from && m < sp.to)
      const low = s < SAMPLES && inUse && a.battery[s] < 20
      if (low && start < 0) start = s
      if (!low && start >= 0) {
        alerts.push({
          id: `batt-${a.id}-${start}`, kind: 'battery', from: start * STEP, to: m, since: start * STEP,
          severity: 'warning',
          target: { type: 'asset', id: a.id },
          title: 'Pump battery low',
        })
        start = -1
      }
    }
  }
  alerts.sort((a, b) => a.from - b.from)

  return { seed, rooms, calls, assets, alerts }
}
