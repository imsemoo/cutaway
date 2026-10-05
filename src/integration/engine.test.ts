import { describe, expect, it } from 'vitest'
import { STORY, WING_BY_CODE } from '../data/floorplan'
import type { Timed } from '../live/hub'
import { toEvents } from '../live/events'
import { LIMIT } from '../data/limits'
import { SEED, simulate } from '../sim/simulate'
import { STEP } from '../sim/time'
import { deviceMessages } from './devices'
import { createEngine } from './engine'
import { topic } from './topics'

const day = simulate()

/** JSON with every object's keys in order, so two events that say the same thing read the same. */
const canon = (v: unknown) =>
  JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x))

/** What one list has that the other lacks, counted, as readable lines. */
function difference(got: string[], want: string[]) {
  const count = new Map<string, number>()
  for (const x of got) count.set(x, (count.get(x) ?? 0) + 1)
  for (const x of want) count.set(x, (count.get(x) ?? 0) - 1)
  return [...count].filter(([, n]) => n !== 0).map(([x, n]) => `${n > 0 ? 'extra' : 'missing'}: ${x.slice(0, 200)}`)
}

const run = (d = day) => {
  const engine = createEngine()
  const out: Timed[] = []
  for (const m of deviceMessages(d)) out.push(...engine.ingest(m.topic, m.payload))
  return { engine, out }
}

describe('the integration engine', () => {
  it('turns the day told as raw device messages into exactly the recorded event log, every alert worked out by its rules', () => {
    const { engine, out } = run()
    const want = toEvents(day).map((e) => canon({ ...e, seq: undefined }))
    expect(engine.dropped).toBe(0)
    expect(difference(out.map(canon), want).slice(0, 12)).toEqual([])
    expect(out.filter((e) => e.kind === 'alert-open').length).toBe(day.alerts.length)
    // In order of time, so a server can append each as it comes.
    expect(out.every((e, i) => i === 0 || e.at >= out[i - 1].at)).toBe(true)
  }, 60_000)

  it('flags stale air at the second high reading, and dates the air from the first', () => {
    const { out } = run(simulate(SEED, [WING_BY_CODE[STORY]]))
    const stale = out.filter((e) => e.kind === 'alert-open' && e.alert.kind === 'co2')
    expect(stale.length).toBeGreaterThan(0)
    for (const e of stale) if (e.kind === 'alert-open') expect(e.alert.from - e.alert.since).toBe((LIMIT.co2Readings - 1) * STEP)
  })

  it('drops what it cannot place, and passes on a repeated status once', () => {
    const engine = createEngine()
    expect(engine.ingest(topic.bms('9Z99'), { at: 600, temp: 22, co2: 500 })).toEqual([])
    expect(engine.ingest(topic.beds('4A01'), { at: 600, state: 'asleep' })).toEqual([])
    expect(engine.ingest(topic.beds('4A01'), { state: 'occupied' })).toEqual([])
    expect(engine.ingest('elsewhere/beds/4A01', { at: 600, state: 'occupied' })).toEqual([])
    expect(engine.ingest(topic.rtls('IVP-01'), { at: 600, kind: 'pump', loc: 'nowhere', status: 'in-use' })).toEqual([])
    expect(engine.dropped).toBe(5)
    expect(engine.ingest(topic.beds('4A01'), { at: 600, state: 'dirty' })).toHaveLength(1)
    expect(engine.ingest(topic.beds('4A01'), { at: 605, state: 'dirty' })).toEqual([])
    // Still dirty an hour on, from when it was first said.
    expect(engine.ingest(topic.clock, { at: 660 })).toMatchObject([{ kind: 'alert-open', alert: { id: 'dirty-4A01-600', from: 660 } }])
  })
})
