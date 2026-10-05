import { STORY, WINGS, type Wing } from '../data/floorplan'
import type { Alert, Asset, AssetKind, AssetSpan, AssetStatus, BedRequest, BedSpan, CallEvent, Day, DischargePlan, RoomDay } from '../data/types'

/*
  One simulated day in the hospital, generated from a fixed seed so every
  visitor replays the same day. Nothing here is real patient data.

  Every wing lives the same kind of day: discharges late in the morning,
  admissions through the evening, beds waiting to be cleaned, call lights
  that wait longer at shift change, and equipment following the patients.
  Level 4's A wing, the one the demo opens on, tells a scripted story on
  top of that:
  - discharges cluster late morning, admissions from ED in the evening,
    so beds sit dirty, then in cleaning, then ready and waiting;
  - an HVAC fault warms 4A09 through the afternoon;
  - the family lounge gets stuffy in evening visiting hours;
  - one infusion pump runs low on battery until a nurse plugs it in;
  - call lights wait longer at shift handover.
  The other wings draw their discharges, admissions and the odd HVAC fault
  at random, each from its own seed, so one wing's day never shifts
  another's.
*/

import { LIMIT } from '../data/limits'
import { callAlerts, roomAlerts } from './rules'
import { DAY_MIN, SAMPLES, STEP } from './time'

const hm = (h: number, m = 0) => h * 60 + m

/** A small seeded random number generator: the same seed, the same numbers. */
export function mulberry32(seed: number) {
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

/** The day of the given wings, the whole hospital by default. A wing's day is the same whichever others come with it. */
export function simulate(seed = SEED, wings: Wing[] = WINGS): Day {
  const days = wings.map((w) => simulateWing(w, w.code === STORY ? seed : seed + 7919 * (WINGS.indexOf(w) + 1), w.code === STORY))
  // Sorts are stable, so each wing's own order survives the merge.
  return {
    seed,
    rooms: Object.assign({}, ...days.map((d) => d.rooms)),
    calls: days.flatMap((d) => d.calls).sort((a, b) => a.at - b.at),
    assets: days.flatMap((d) => d.assets),
    alerts: days.flatMap((d) => d.alerts).sort((a, b) => a.from - b.from),
    requests: days.flatMap((d) => d.requests).sort((a, b) => a.at - b.at),
    plans: days.flatMap((d) => d.plans).sort((a, b) => a.at - b.at),
    // What operators do is added as they do it.
    actions: [],
  }
}

/** Equipment per wing: the story wing's small fleet, and the fuller one of every other wing. */
const FLEET: Record<'story' | 'wing', [AssetKind, string, number][]> = {
  story: [['pump', 'IVP', 18], ['vent', 'VEN', 4], ['chair', 'WCH', 6], ['xray', 'PXR', 1], ['scanner', 'BSC', 2]],
  wing: [['pump', 'IVP', 58], ['vent', 'VEN', 6], ['chair', 'WCH', 15], ['xray', 'PXR', 2], ['scanner', 'BSC', 4]],
}

/**
  An ordinary wing's day, which the story wing departs from: how many patients go home and
  when, how long a vacated bed waits for cleaning and how long cleaning takes, in minutes,
  and when admissions arrive. Each wing admits between three fewer patients than it
  discharged (two at least) and as many. The forecast reads these as the hospital's history.
*/
export const WARD = {
  discharges: [4, 9],
  leave: [hm(9, 30), hm(15, 30)],
  wait: [15, 90],
  clean: [35, 50],
  arrive: [hm(11), hm(21, 30)],
} as const

/** How discharges are planned: the share planned ahead, the morning round's hours, and how far an estimate slips, in minutes (late is positive). */
export const PLAN = { share: 0.85, round: [hm(8), hm(9, 30)], slip: [-20, 70] } as const

function simulateWing(w: Wing, seed: number, story: boolean): Day {
  const rnd = mulberry32(seed)
  const rand = (a: number, b: number) => a + (b - a) * rnd()
  const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)]

  /* ---------- 1. Beds ---------- */

  const spans: Record<string, BedSpan[]> = {}
  const push = (id: string, s: BedSpan) => (spans[id] ??= []).push(s)
  const general = w.beds.filter((r) => r.kind === 'patient').map((r) => r.id)
  const icu = w.beds.filter((r) => r.kind === 'icu').map((r) => r.id)

  const generalAcuity = () => (rnd() < 0.3 ? 1 : rnd() < 0.72 ? 2 : 3)

  const scripted = new Set<string>()
  if (story) {
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
    for (const id of ['4B07', '4A09', '4A11', '4A03', '4B02']) scripted.add(id)
  }

  const pool = general.filter((id) => !scripted.has(id))
  // Shuffle deterministically, then take the discharges.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  let discharges: { t: number; wait: number; clean: number }[]
  let admissions: number[]
  if (story) {
    discharges = [
      { t: hm(10, 5), wait: 25, clean: 40 },
      { t: hm(10, 40), wait: 40, clean: 45 },
      { t: hm(11, 20), wait: 30, clean: 40 },
      { t: hm(11, 55), wait: 50, clean: 45 },
      { t: hm(12, 30), wait: 35, clean: 40 },
      { t: hm(13, 15), wait: 80, clean: 45 },
      { t: hm(13, 50), wait: 30, clean: 40 },
      { t: hm(14, 5), wait: 45, clean: 40 },
    ]
    admissions = [hm(11, 45), hm(12, 50), hm(13, 40), hm(15, 10), hm(16, 5), hm(17, 20), hm(18, 40), hm(20, 30)]
  } else {
    discharges = Array.from({ length: randInt(...WARD.discharges) }, () => ({ t: randInt(...WARD.leave), wait: randInt(...WARD.wait), clean: randInt(...WARD.clean) })).sort(
      (a, b) => a.t - b.t,
    )
    admissions = Array.from({ length: randInt(Math.max(2, discharges.length - 3), discharges.length) }, () => randInt(...WARD.arrive)).sort((a, b) => a - b)
    // Now and then a room is closed for repairs all day.
    if (rnd() < 0.3) {
      const id = pool.pop()!
      push(id, { from: 0, to: DAY_MIN, state: 'blocked', note: pick(['Out of service: bed rail fault, engineer booked', 'Out of service: repainting', 'Out of service: call bell repair']) })
    }
  }
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
  // A bed cleaned but not yet needed stays ready for the rest of the day.
  for (const bed of readyAt.slice(admissions.length)) push(bed.id, { from: bed.at, to: DAY_MIN, state: 'ready' })
  for (const id of pool.slice(discharges.length)) {
    push(id, { from: 0, to: DAY_MIN, state: 'occupied', acuity: generalAcuity() })
  }

  // What the ward knows ahead of time, from a stream of its own, so the day drawn above stays as it was.
  const ahead = mulberry32(seed ^ 0x2545f491)
  // Who asked for a ward bed and when they got one: the admissions above, and the three the story arranges for a bed already ready.
  const asked = admissions.map((t, i) => ({ at: t, admitted: Math.max(t, readyAt[i].at + 10), room: readyAt[i].id }))
  if (story) for (const [room, at] of [['4A11', hm(8, 20)], ['4B02', hm(9, 10)], ['4A03', hm(11, 25)]] as const) asked.push({ at, admitted: at, room })
  const requests: BedRequest[] = asked
    .sort((a, b) => a.at - b.at)
    .map((r, i) => ({ id: `REQ-${w.code}-${String(i + 1).padStart(2, '0')}`, wing: w.code, ...r }))
  // Most discharges are planned at the morning board round; the estimate slips, more often late than early.
  const plans: DischargePlan[] = []
  discharges.forEach((d, i) => {
    // Three draws for each, used or not, so one plan never shifts the next.
    const planned = ahead() < PLAN.share
    const round = PLAN.round[0] + ahead() * (PLAN.round[1] - PLAN.round[0])
    const slip = PLAN.slip[0] + ahead() * (PLAN.slip[1] - PLAN.slip[0])
    if (!planned) return
    const at = Math.round(Math.min(round, d.t - 30))
    plans.push({ room: pool[i], at, eta: Math.max(at + STEP, Math.round((d.t - slip) / STEP) * STEP) })
  })

  // ICU: in the story, one step-down transfer and one bed held for an ED admission.
  for (const id of icu) {
    if (story && id === '4C02') {
      push(id, { from: 0, to: hm(11, 10), state: 'occupied', acuity: 3, note: 'Stepped down to ward room 4A03' })
      push(id, { from: hm(11, 10), to: hm(11, 40), state: 'dirty' })
      push(id, { from: hm(11, 40), to: hm(12, 35), state: 'cleaning' })
      push(id, { from: hm(12, 35), to: hm(19, 40), state: 'ready' })
      push(id, { from: hm(19, 40), to: DAY_MIN, state: 'occupied', acuity: 4, note: 'Admitted from theatre' })
    } else if (story && id === '4C05') {
      push(id, { from: 0, to: hm(16, 40), state: 'ready' })
      push(id, { from: hm(16, 40), to: DAY_MIN, state: 'occupied', acuity: 4, note: 'Admitted from ED' })
    } else if (!story && rnd() < 0.15) {
      const admit = randInt(hm(8), hm(22))
      push(id, { from: 0, to: admit, state: 'ready' })
      push(id, { from: admit, to: DAY_MIN, state: 'occupied', acuity: 4, note: pick(['Admitted from ED', 'Admitted from theatre']) })
    } else {
      push(id, { from: 0, to: DAY_MIN, state: 'occupied', acuity: rnd() < 0.55 ? 4 : 3 })
    }
  }
  for (const id of Object.keys(spans)) spans[id].sort((a, b) => a.from - b.from)

  // Read for every room at every step, so a plain loop rather than find() and a closure per call.
  const stateAt = (id: string, m: number) => {
    const list = spans[id]
    if (list) for (const s of list) if (m >= s.from && m < s.to) return s
    return undefined
  }

  /* ---------- 2. Room environment ---------- */

  // In the story, an HVAC fault warms 4A09 from 12:10 until it is fixed at 17:40. A wing now and then has one of its own.
  const fault = story
    ? { room: '4A09', start: hm(12, 10), peak: hm(15, 20), fixed: hm(17, 40), rise: 4.4 }
    : rnd() < 0.3
      ? (() => {
          const start = randInt(hm(9), hm(16))
          return { room: pick(general), start, peak: start + randInt(120, 200), fixed: start + randInt(260, 380), rise: rand(3.4, 4.6) }
        })()
      : undefined

  // The parts of the readings that depend only on the time of day, once for every room.
  const diurnal: number[] = []
  const visiting: [number, number][] = []
  const staff: number[] = []
  const lounge: number[] = []
  for (let s = 0; s < SAMPLES; s++) {
    const m = s * STEP
    diurnal.push(0.45 * Math.sin((2 * Math.PI * (m - hm(9))) / DAY_MIN))
    visiting.push([bump(m, hm(17, 30), 110), bump(m, hm(12, 30), 70)])
    staff.push(140 + bump(m, hm(7, 15), 25) * 260 + bump(m, hm(19, 15), 25) * 260)
    lounge.push(60 + bump(m, hm(18, 0), 95) * 830 + bump(m, hm(13, 0), 80) * 310)
  }

  const rooms: Record<string, RoomDay> = {}
  for (const room of w.rooms) {
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
      let t = base + diurnal[s] + tn
      if (fault?.room === room.id) {
        const rise = smoothstep(fault.start, fault.peak, m) * fault.rise
        const fall = m > fault.fixed ? Math.exp(-(m - fault.fixed) / 45) : 1
        t += rise * fall
      }
      temp.push(Math.round(t * 10) / 10)

      const occ = stateAt(room.id, m)?.state === 'occupied'
      let c = 420 + cn
      if (room.kind === 'patient' || room.kind === 'icu') {
        c += occ ? 170 : 20
        if (occ && room.kind === 'patient') c += visiting[s][0] * visitors + visiting[s][1] * visitors * 0.4
      } else if (room.kind === 'station') {
        c += staff[s]
      } else if (room.kind === 'lounge') {
        c += lounge[s]
      } else {
        c += 40
      }
      co2.push(Math.round(c))
    }
    rooms[room.id] = { spans: spans[room.id] ?? [], temp, co2 }
  }

  /* ---------- 3. Call lights ---------- */

  const calls: CallEvent[] = []
  const busy: number[] = []
  for (let m = 0; m < DAY_MIN; m += STEP) busy.push(1 + bump(m, hm(7, 15), 20) * 1.6 + bump(m, hm(19, 15), 20) * 1.6 + bump(m, hm(12, 15), 60) * 0.5)
  for (const room of w.beds) {
    for (let m = 0; m < DAY_MIN; m += STEP) {
      const s = stateAt(room.id, m)
      if (s?.state !== 'occupied') continue
      const perHour = (room.kind === 'icu' ? 0.05 : 0.12) + 0.05 * (s.acuity ?? 1) + (m > hm(6) && m < hm(22) ? 0.06 : -0.04)
      if (rnd() < (perHour * STEP) / 60) {
        const wait = Math.min(14, Math.max(0.4, -Math.log(1 - rnd()) * 1.9 * busy[m / STEP]))
        calls.push({ room: room.id, at: m + randInt(0, 4), wait: Math.round(wait * 10) / 10 })
      }
    }
  }
  // A long wait during the afternoon rush, so the default view has one.
  if (story) calls.push({ room: '4B04', at: hm(14, 21), wait: 11.5 })
  calls.sort((a, b) => a.at - b.at)

  /* ---------- 4. Equipment ---------- */

  const assets: Asset[] = []
  for (const [kind, prefix, n] of FLEET[story ? 'story' : 'wing']) {
    for (let i = 1; i <= n; i++) {
      const tag = String(i).padStart(2, '0')
      assets.push({ id: story ? `${prefix}-${tag}` : `${prefix}-${w.code}-${tag}`, kind, wing: w.code, spans: [] })
    }
  }

  // Pumps and ventilators follow patients: stepped simulation.
  type Unit = { loc: string; status: AssetStatus; until: number; battery: number; spans: AssetSpan[]; charge: number[] }
  const need = new Map<BedSpan, { pump: number; vent: number }>()
  for (const room of w.beds) {
    for (const s of spans[room.id] ?? []) {
      if (s.state !== 'occupied') continue
      const a = s.acuity ?? 1
      const pump = room.kind === 'icu' ? (a === 4 ? 2 : 1) : a === 3 ? 1 : a === 2 && rnd() < 0.3 ? 1 : 0
      need.set(s, { pump, vent: room.kind === 'icu' && a === 4 ? 1 : 0 })
    }
  }
  const units = new Map<Asset, Unit>()
  const fleets: Record<'pump' | 'vent', Unit[]> = { pump: [], vent: [] }
  for (const a of assets) {
    if (a.kind === 'pump' || a.kind === 'vent') {
      const unit: Unit = { loc: w.store, status: 'available', until: 0, battery: a.kind === 'pump' ? randInt(78, 100) : 100, spans: [], charge: [] }
      units.set(a, unit)
      fleets[a.kind].push(unit)
    }
  }
  // What every bed asks for at every step, read once rather than once per kind.
  const asks = w.beds.map((room) => {
    const pump: number[] = []
    const vent: number[] = []
    for (let m = 0; m < DAY_MIN; m += STEP) {
      const s = stateAt(room.id, m)
      const n = s ? need.get(s) : undefined
      pump.push(n?.pump ?? 0)
      vent.push(n?.vent ?? 0)
    }
    return { room: room.id, pump, vent }
  })

  for (let k = 0, m = 0; m < DAY_MIN; k++, m += STEP) {
    for (const kind of ['pump', 'vent'] as const) {
      const list = fleets[kind]
      for (const st of list) {
        if (st.status === 'needs-cleaning' && m >= st.until) {
          st.loc = w.store
          st.status = 'charging'
        }
        if (st.status === 'charging' || st.status === 'available') {
          st.battery = Math.min(100, st.battery + 2.2)
          st.status = st.battery >= 96 ? 'available' : 'charging'
        }
        // A pump at the bedside runs on mains and tops up; one scripted pump below does not.
        if (st.status === 'in-use' && kind === 'pump') st.battery = Math.min(100, st.battery + 0.3)
      }
      // Who is at which bedside, in fleet order: one pass, not one per bed.
      const inUse = new Map<string, Unit[]>()
      for (const st of list) {
        if (st.status !== 'in-use') continue
        const here = inUse.get(st.loc)
        if (here) here.push(st)
        else inUse.set(st.loc, [st])
      }
      for (const ask of asks) {
        const wanted = ask[kind][k]
        const here = inUse.get(ask.room) ?? []
        for (let i = wanted; i < here.length; i++) {
          const st = here[i]
          st.loc = w.soiled
          st.status = 'needs-cleaning'
          st.until = m + (kind === 'vent' ? 70 : 45)
        }
        for (let i = here.length; i < wanted; i++) {
          // The best-charged unit in the store; on a tie, the first in the fleet.
          let free: Unit | undefined
          for (const st of list) {
            if (st.loc !== w.store || !(st.status === 'available' || (st.status === 'charging' && st.battery > 40))) continue
            if (!free || st.battery > free.battery) free = st
          }
          if (!free) break
          free.loc = ask.room
          free.status = 'in-use'
        }
      }
      for (const st of list) {
        const last = st.spans[st.spans.length - 1]
        if (last && last.loc === st.loc && last.status === st.status) last.to = m + STEP
        else st.spans.push({ from: m, to: m + STEP, loc: st.loc, status: st.status })
        st.charge.push(Math.round(st.battery))
      }
    }
  }
  for (const [a, unit] of units) {
    a.spans = unit.spans
    if (a.spans.length) a.spans[a.spans.length - 1].to = DAY_MIN
    if (a.kind === 'pump') a.battery = [...unit.charge, unit.charge[unit.charge.length - 1]]
  }

  // The story's low-battery pump: the one in use longest across 14:30.
  const lowPump = story
    ? assets
        .filter((a) => a.kind === 'pump')
        .map((a) => ({ a, span: a.spans.find((s) => s.status === 'in-use' && s.from <= hm(12) && s.to > hm(15, 30)) }))
        .filter((x) => x.span)
        .sort((x, y) => x.span!.from - y.span!.from)[0]
    : undefined
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
      { loc: w.lobby, until: d.t + 15 },
    ])
  })
  // Portable X-ray: the ICU round early in the morning, then the odd ward film.
  const xrayRounds: [string, number][] = story
    ? [['4C01', hm(6, 10)], ['4C03', hm(6, 25)], ['4C04', hm(6, 40)], ['4C06', hm(6, 55)], ['4A05', hm(11, 30)], ['4B09', hm(16, 10)], ['4C05', hm(17, 5)]]
    : [...icu.map((id, i) => [id, hm(6) + i * 15] as [string, number]), [pick(general), randInt(hm(10), hm(12))], [pick(general), randInt(hm(15), hm(18))]]
  for (const [loc, at] of xrayRounds) book('xray', at, at + 15, [{ loc, until: at + 15 }])
  const occupiedAt = (m: number) => w.beds.filter((r) => r.kind === 'patient' && stateAt(r.id, m)?.state === 'occupied').map((r) => r.id)
  for (let i = 0; i < 9; i++) {
    const at = randInt(hm(7), hm(21)) - (randInt(hm(7), hm(21)) % 5)
    const rooms = occupiedAt(at)
    const loc = rooms[randInt(0, rooms.length - 1)]
    book('scanner', at, at + 10, [{ loc, until: at + 10 }])
  }
  for (const a of assets) {
    if (a.kind === 'pump' || a.kind === 'vent') continue
    const home = a.kind === 'chair' ? w.lobby : w.store
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
  const alerts: Alert[] = [...w.rooms.flatMap((room) => roomAlerts(room.id, rooms[room.id])), ...callAlerts(calls)]
  // Dirty beds waiting over an hour for cleaning, clean beds over two hours without a patient.
  for (const room of w.beds) {
    for (const s of spans[room.id] ?? []) {
      if (s.state === 'dirty' && s.to - s.from > LIMIT.dirty) {
        alerts.push({
          id: `dirty-${room.id}-${s.from}`, kind: 'dirty', from: s.from + LIMIT.dirty, to: s.to, since: s.from,
          severity: 'warning',
          target: { type: 'room', id: room.id },
          title: 'Bed waiting for cleaning',
        })
      }
      if (s.state === 'ready' && s.to - s.from > LIMIT.ready && s.from > 0) {
        alerts.push({
          id: `ready-${room.id}-${s.from}`, kind: 'ready', from: s.from + LIMIT.ready, to: s.to, since: s.from,
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
    let j = 0 // spans are in order and never overlap, so one pointer walks them with the samples
    for (let s = 0; s <= SAMPLES; s++) {
      const m = s * STEP
      while (j < a.spans.length && a.spans[j].to <= m) j++
      const inUse = j < a.spans.length && a.spans[j].status === 'in-use' && m >= a.spans[j].from
      const low = s < SAMPLES && inUse && a.battery[s] < LIMIT.battery
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

  return { seed, rooms, calls, assets, alerts, requests, plans, actions: [] }
}
