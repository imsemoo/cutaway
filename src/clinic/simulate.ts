import type { Building, BuildingSpace } from '../data/building'
import type { BedSpan, CallEvent, Day, RoomDay } from '../data/types'
import { callAlerts, roomAlerts } from '../sim/rules'
import { mulberry32 } from '../sim/simulate'
import { DAY_MIN, SAMPLES, STEP } from '../sim/time'

/*
  A simulated day in the imported clinic, on its real plan. Nothing here is
  real patient data; the rooms are the clinic's own.

  The clinic opens at 07:30 and closes at 18:00. Its care rooms (exam,
  treatment, dental and imaging) see one patient after another: in use,
  then waiting to be turned over, cleaned, and ready for the next.
  Waiting rooms fill in the late morning and mid-afternoon, and the larger
  ones' air grows stale. In the afternoon the cooling of the X-ray room,
  2A12, fails and the room warms until it is fixed; and one call light
  waits too long.

  Alerts are recorded by the same rules as the hospital's (sim/rules.ts):
  rooms too warm, stale air, call lights unanswered. Turnover is shown on
  the floor rather than flagged: an empty exam room is an ordinary thing
  in a clinic.
*/

export const CLINIC_SEED = 20261002
const hm = (h: number, m = 0) => h * 60 + m
const OPEN = hm(7, 30)
const CLOSE = hm(18)
const bump = (m: number, at: number, width: number) => Math.exp(-((m - at) ** 2) / (2 * width * width))

/** How long a visit takes, by the kind of care room, in minutes. */
function visitLength(space: BuildingSpace): [number, number] {
  if (/Scanning|Imaging/.test(space.category)) return [10, 20]
  if (/^OH DTR/.test(space.name)) return [35, 60]
  return [15, 35]
}

export function simulateClinic(building: Building, seed = CLINIC_SEED): Day {
  const rnd = mulberry32(seed)
  const rand = (a: number, b: number) => a + (b - a) * rnd()
  const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))

  // Care rooms, one patient after another while the clinic is open.
  const spans: Record<string, BedSpan[]> = {}
  for (const space of building.spaces) {
    if (space.kind !== 'care') continue
    const list: BedSpan[] = []
    const [shortest, longest] = visitLength(space)
    let t = OPEN + randInt(0, 25)
    list.push({ from: 0, to: t, state: 'ready' })
    while (t < CLOSE - shortest) {
      const visit = randInt(shortest, longest)
      const wait = rnd() < 0.08 ? randInt(25, 75) : randInt(2, 12)
      const clean = randInt(5, 12)
      list.push({ from: t, to: t + visit, state: 'occupied' })
      list.push({ from: t + visit, to: t + visit + wait, state: 'dirty' })
      list.push({ from: t + visit + wait, to: t + visit + wait + clean, state: 'cleaning' })
      const ready = t + visit + wait + clean
      t = Math.min(DAY_MIN, ready + randInt(0, 25))
      list.push({ from: ready, to: t, state: 'ready' })
    }
    // After its last turnover the room stays ready to midnight, as one span: a second would restart its "since".
    list[list.length - 1].to = DAY_MIN
    spans[space.id] = list.filter((s) => s.to > s.from)
  }
  const inUse = (id: string, m: number) => spans[id]?.some((s) => s.state === 'occupied' && m >= s.from && m < s.to) ?? false

  // Readings every five minutes.
  const largest = Math.max(...building.spaces.filter((s) => s.kind === 'waiting').map((s) => s.area))
  const rooms: Record<string, RoomDay> = {}
  for (const space of building.spaces) {
    const base = space.kind === 'care' ? rand(21.6, 22.4) : space.kind === 'circulation' ? 22.8 : rand(22.0, 22.9)
    const crowd = space.kind === 'waiting' ? 0.35 + 0.65 * (space.area / largest) : 0
    const temp: number[] = []
    const co2: number[] = []
    let tn = 0
    let cn = 0
    for (let s = 0; s < SAMPLES; s++) {
      const m = s * STEP
      const open = m >= OPEN && m < CLOSE
      tn = tn * 0.9 + (rnd() - 0.5) * 0.12
      cn = cn * 0.85 + (rnd() - 0.5) * 20
      let t = base + 0.4 * Math.sin((2 * Math.PI * (m - hm(9))) / DAY_MIN) + tn + (inUse(space.id, m) ? 0.3 : 0)
      // The X-ray room's cooling fails after lunch and is fixed late in the afternoon.
      if (space.id === '2A12') {
        const rise = Math.min(1, Math.max(0, (m - hm(12, 40)) / 140)) * 4.6
        t += m > hm(17, 20) ? rise * Math.exp(-(m - hm(17, 20)) / 40) : rise
      }
      temp.push(Math.round(t * 10) / 10)
      let c = 420 + cn
      if (inUse(space.id, m)) c += 240
      if (open && crowd) c += crowd * (bump(m, hm(10, 45), 75) * 820 + bump(m, hm(15), 60) * 520)
      else if (open && space.kind !== 'circulation') c += 60
      co2.push(Math.round(c))
    }
    rooms[space.id] = { spans: spans[space.id] ?? [], temp, co2 }
  }

  // Call lights in care rooms, while a patient is in.
  const calls: CallEvent[] = []
  for (const [room, list] of Object.entries(spans)) {
    for (const s of list) {
      if (s.state !== 'occupied') continue
      for (let m = s.from; m < s.to; m += STEP) {
        // Rung within the five minutes, and before the patient leaves.
        if (rnd() < 0.025) calls.push({ room, at: Math.min(s.to - 1, m + randInt(0, 4)), wait: Math.round(Math.min(9, Math.max(0.4, -Math.log(1 - rnd()) * 1.6)) * 10) / 10 })
      }
    }
  }
  // At the afternoon rush one call waits too long, in the first care room with a patient in throughout.
  const LATE = { at: hm(14, 21), wait: 11.5 }
  const late = Object.keys(spans).find((id) => spans[id].some((v) => v.state === 'occupied' && v.from <= LATE.at && v.to > LATE.at + LATE.wait))
  if (late) calls.push({ room: late, ...LATE })
  calls.sort((a, b) => a.at - b.at || a.room.localeCompare(b.room))

  const alerts = [...building.spaces.flatMap((s) => roomAlerts(s.id, rooms[s.id])), ...callAlerts(calls)].sort((a, b) => a.from - b.from)
  return { seed, rooms, calls, assets: [], alerts, requests: [], plans: [], actions: [] }
}
