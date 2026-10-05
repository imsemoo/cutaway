import type { Day } from '../data/types'
import { DAY_MIN, STEP } from '../sim/time'
import { topic, type BedStatus, type Clock, type FlowRequest, type Message, type NurseCall, type Payload, type Reading, type RoundPlan, type TagReport, type Telemetry } from './topics'

/*
  The hospital's systems, simulated: the recorded day told as the raw
  messages they would publish, with no alert among them. Alerts are the
  integration server's to work out.

  Messages come in time order. Within a minute, what changed comes first,
  then the five-minute readings, then the clock, so a rule checked at a
  minute sees everything that happened by then.
*/

/** Every state change of the day, in time order: beds, tags, call lights, bed requests and round plans. */
function changes(day: Day): Message[] {
  const out: Message[] = []
  const add = (t: string, payload: Payload) => {
    if (payload.at < DAY_MIN) out.push({ topic: t, payload })
  }
  for (const [room, { spans }] of Object.entries(day.rooms)) {
    for (const s of spans) add(topic.beds(room), { at: s.from, state: s.state, acuity: s.acuity, note: s.note } satisfies BedStatus)
  }
  for (const a of day.assets) {
    for (const s of a.spans) add(topic.rtls(a.id), { at: s.from, kind: a.kind, loc: s.loc, status: s.status } satisfies TagReport)
  }
  for (const c of day.calls) {
    add(topic.nursecall(c.room), { at: c.at, on: true, pressed: c.at } satisfies NurseCall)
    add(topic.nursecall(c.room), { at: c.at + c.wait, on: false, pressed: c.at } satisfies NurseCall)
  }
  for (const r of day.requests) {
    add(topic.request(r.id), { at: r.at, wing: r.wing, waiting: true } satisfies FlowRequest)
    add(topic.request(r.id), { at: r.admitted, wing: r.wing, waiting: false, room: r.room } satisfies FlowRequest)
  }
  for (const p of day.plans) add(topic.plan(p.room), { at: p.at, eta: p.eta } satisfies RoundPlan)
  // Array sort is stable, so the order above holds within each minute.
  return out.sort((a, b) => a.payload.at - b.payload.at)
}

/** The day's messages in the order the systems would send them, minute by minute. */
export function* deviceMessages(day: Day): Generator<Message> {
  const log = changes(day)
  const pumps = day.assets.filter((a) => a.battery)
  const rooms = Object.entries(day.rooms)
  let i = 0
  for (let m = 0; m < DAY_MIN; m++) {
    while (i < log.length && log[i].payload.at <= m) yield log[i++]
    if (m % STEP === 0) {
      const slot = m / STEP
      for (const [room, r] of rooms) yield { topic: topic.bms(room), payload: { at: m, temp: r.temp[slot], co2: r.co2[slot] } satisfies Reading }
      for (const a of pumps) yield { topic: topic.telemetry(a.id), payload: { at: m, battery: a.battery![slot] } satisfies Telemetry }
    }
    yield { topic: topic.clock, payload: { at: m } satisfies Clock }
  }
  // What happens in the day's last minute, after its clock.
  while (i < log.length) yield log[i++]
}
