import type { Wing } from '../data/floorplan'
import type { Day, DischargePlan } from '../data/types'
import { PLAN, WARD, mulberry32 } from '../sim/simulate'
import { DAY_MIN } from '../sim/time'
import { bedAt } from './query'

/*
  How many ward beds will be free over the next four hours, net of the
  patients waiting for one.

  The count that matters to a bed manager is the balance: clean, empty ward
  beds less the patients waiting for a ward bed. An admission takes one of
  each and leaves the balance as it was; a bed coming out of cleaning adds
  one, and a new request takes one away. So the balance ahead is the
  balance now, plus the beds that will come ready, less the requests that
  will arrive.

  The forecast is made only from what is known at the minute: the beds
  waiting for cleaning or being cleaned and for how long, the discharges the
  morning round planned that have not happened yet, and the usual day: how
  long a bed waits for cleaning and how long cleaning takes, how far a
  planned discharge slips, how many go unplanned, and when admissions
  arrive. The usual day is the simulation's own (WARD and PLAN); in a
  hospital it would come from its history. Nothing from later in the day
  is read.

  Each run draws how long every bed takes and how many requests arrive; the
  runs together give the range. The draws are seeded by the minute and the
  place, so the same view always shows the same forecast.
*/

/** How far ahead, and the spacing of the steps, in minutes. */
export const HORIZON = 240
export const STRIDE = 15
const RUNS = 300

const span = ([lo, hi]: readonly [number, number]) => hi - lo
const mid = ([lo, hi]: readonly [number, number]) => (lo + hi) / 2
// Discharges per wing a day; admissions, between three fewer (two at least) and as many.
let admitted = 0
for (let d = WARD.discharges[0]; d <= WARD.discharges[1]; d++) admitted += mid([Math.max(2, d - 3), d])
admitted /= span(WARD.discharges) + 1
/** New requests and unplanned discharges per wing per minute, inside their hours. */
const RATE = {
  arrive: admitted / span(WARD.arrive),
  unplanned: (mid(WARD.discharges) * (1 - PLAN.share)) / span(WARD.leave),
}

export interface Outlook {
  /** Ward beds clean and empty now. */
  ready: number
  /** Patients waiting for a ward bed now, and the longest wait so far in minutes. */
  waiting: number
  longest: number
  /** Ward beds waiting for cleaning or being cleaned now. */
  turning: number
  /** Planned discharges still to come. */
  planned: number
  /** The requests the usual day expects before the last step. */
  arrivals: number
  /** The balance at now and every STRIDE minutes after, to the horizon or midnight: the 10th, 50th and 90th percentile of the runs. */
  steps: { at: number; low: number; mid: number; high: number }[]
}

const wardBeds = (wings: Wing[]) => wings.flatMap((w) => w.beds.filter((r) => r.kind === 'patient'))

/** The balance at minute m as it stood: ward beds clean and empty less the patients waiting for one. */
export function balanceAt(day: Day, m: number, wings: Wing[]) {
  const codes = new Set(wings.map((w) => w.code))
  let ready = 0
  for (const r of wardBeds(wings)) if (bedAt(day, r.id, m)?.state === 'ready') ready++
  let waiting = 0
  for (const q of day.requests) if (codes.has(q.wing) && q.at <= m && q.admitted > m) waiting++
  return ready - waiting
}

// Each room's plans, found once a day.
const plansOf = new WeakMap<DischargePlan[], Map<string, DischargePlan[]>>()
function roomPlans(day: Day) {
  let map = plansOf.get(day.plans)
  if (!map) {
    map = new Map()
    for (const p of day.plans) map.set(p.room, [...(map.get(p.room) ?? []), p])
    plansOf.set(day.plans, map)
  }
  return map
}

/** The plan for the patient in a room now, if it was noted by minute t while they were there: a discharge still to come. */
export function pendingPlan(day: Day, room: string, t: number) {
  const bed = bedAt(day, room, t)
  if (bed?.state !== 'occupied') return undefined
  return roomPlans(day)
    .get(room)
    ?.filter((p) => p.at <= t && p.at >= bed.from)
    .at(-1)
}

/** A Poisson draw: Knuth's way, which is exact and quick for the small means here. */
function poisson(mean: number, random: () => number) {
  if (mean <= 0) return 0
  const limit = Math.exp(-mean)
  let n = -1
  for (let p = 1; p > limit; p *= random()) n++
  return n
}

/** The minutes of [a, b] inside the hours [lo, hi]. */
const overlap = (a: number, b: number, [lo, hi]: readonly [number, number]) => Math.max(0, Math.min(b, hi) - Math.max(a, lo))

export function outlook(day: Day, t: number, wings: Wing[], runs = RUNS): Outlook {
  const codes = new Set(wings.map((w) => w.code))
  const steps = Math.floor(Math.min(HORIZON, DAY_MIN - t) / STRIDE)

  // What is known now.
  let ready = 0
  let waiting = 0
  let longest = 0
  const turning: { state: 'dirty' | 'cleaning'; since: number }[] = []
  const planned: number[] = []
  for (const r of wardBeds(wings)) {
    const bed = bedAt(day, r.id, t)
    if (!bed) continue
    if (bed.state === 'ready') ready++
    else if (bed.state === 'dirty' || bed.state === 'cleaning') turning.push({ state: bed.state, since: bed.from })
    else if (bed.state === 'occupied') {
      const plan = pendingPlan(day, r.id, t)
      if (plan) planned.push(plan.eta)
    }
  }
  for (const q of day.requests) {
    if (!codes.has(q.wing) || q.at > t || q.admitted <= t) continue
    waiting++
    longest = Math.max(longest, t - q.at)
  }
  const now = ready - waiting

  // Before the round is over, some of the day's planned discharges are not written down yet: expect them from the usual day.
  const unwritten = PLAN.share * mid(WARD.discharges) * wings.length * Math.min(1, Math.max(0, (PLAN.round[1] - t) / span(PLAN.round)))
  const leaveFrom = Math.max(t, WARD.leave[0])

  // Seeded by the minute and the place.
  let seed = Math.round(t * 10)
  for (const code of codes) for (let i = 0; i < code.length; i++) seed = Math.imul(seed ^ code.charCodeAt(i), 16777619)
  const random = mulberry32(seed)
  const between = (lo: number, hi: number) => lo + (hi - lo) * random()
  // How much longer something takes that usually takes [lo, hi] minutes and has taken `gone` so far.
  const rest = ([lo, hi]: readonly [number, number], gone: number) => (gone < hi ? between(Math.max(lo, gone), hi) - gone : between(0, STRIDE))
  const turnover = () => between(...WARD.wait) + between(...WARD.clean)

  // One row per run: beds come ready, less requests arrived, in each step.
  const runsOut: number[][] = []
  for (let run = 0; run < runs; run++) {
    const change = new Array<number>(steps + 1).fill(0)
    const bedReady = (at: number) => {
      const k = Math.max(1, Math.ceil((at - t) / STRIDE))
      if (k <= steps) change[k]++
    }
    for (const b of turning) {
      const gone = t - b.since
      bedReady(t + (b.state === 'dirty' ? rest(WARD.wait, gone) + between(...WARD.clean) : rest(WARD.clean, gone)))
    }
    for (const eta of planned) {
      // A discharge leaves at its estimate plus a slip; it has not happened by now.
      const lo = Math.max(t, eta + PLAN.slip[0])
      const hi = eta + PLAN.slip[1]
      bedReady((hi > lo ? between(lo, hi) : t + between(0, 2 * STRIDE)) + turnover())
    }
    if (leaveFrom < WARD.leave[1]) for (let n = poisson(unwritten, random); n > 0; n--) bedReady(between(leaveFrom, WARD.leave[1]) + turnover())
    for (let k = 1; k <= steps; k++) {
      const a = t + (k - 1) * STRIDE
      const b = a + STRIDE
      const leaving = overlap(a, b, WARD.leave)
      for (let n = poisson(RATE.unplanned * leaving * wings.length, random); n > 0; n--) bedReady(between(Math.max(a, WARD.leave[0]), Math.max(a, WARD.leave[0]) + leaving) + turnover())
      change[k] -= poisson(RATE.arrive * overlap(a, b, WARD.arrive) * wings.length, random)
    }
    let balance = now
    runsOut.push(change.map((c) => (balance += c)))
  }

  const pick = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return {
    ready,
    waiting,
    longest,
    turning: turning.length,
    planned: planned.length,
    arrivals: RATE.arrive * overlap(t, t + steps * STRIDE, WARD.arrive) * wings.length,
    steps: Array.from({ length: steps + 1 }, (_, k) => {
      const sorted = runsOut.map((row) => row[k]).sort((a, b) => a - b)
      return { at: t + k * STRIDE, low: pick(sorted, 0.1), mid: pick(sorted, 0.5), high: pick(sorted, 0.9) }
    }),
  }
}
