import { describe, expect, it } from 'vitest'
import { ROOM_BY_ID, STORY, WING_BY_CODE } from '../data/floorplan'
import type { Day } from '../data/types'
import { activeAlerts, activeCall, alertWing, assetAt, batteryAt, bedAt, census, sample } from '../lib/query'
import { simulate } from '../sim/simulate'
import { DAY_MIN, STEP } from '../sim/time'
import { DEFAULT_TIME } from '../state/store'
import { applyEvents, emptyDay, toEvents } from './events'

const day = simulate()
const log = toEvents(day)
const upTo = (m: number) => applyEvents(emptyDay(day.seed), log.filter((e) => e.at <= m))

// The fold runs over the whole hospital; the readings compared are the story wing's and two others', one low and one high.
const SAMPLE = [STORY, '1D', '6R'].map((code) => WING_BY_CODE[code])

/** What the views read about a day at minute m, in the sampled wings. */
function reading(d: Day, m: number) {
  const wings = new Set(SAMPLE.map((w) => w.code))
  return {
    beds: SAMPLE.flatMap((w) => w.beds).map((r) => {
      const s = bedAt(d, r.id, m)
      return [r.id, s?.state, s?.acuity, s?.from, Boolean(activeCall(d, r.id, m))]
    }),
    air: SAMPLE.flatMap((w) => w.rooms).map((r) => [r.id, sample(d.rooms[r.id].temp, m), sample(d.rooms[r.id].co2, m)]),
    assets: d.assets
      .filter((a) => wings.has(a.wing))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => [a.id, assetAt(a, m).loc, assetAt(a, m).status, batteryAt(a, m)]),
    alerts: activeAlerts(d, m)
      .filter((a) => wings.has(alertWing(a) ?? ''))
      .map((a) => a.id)
      .sort(),
    waiting: d.requests
      .filter((r) => wings.has(r.wing) && r.at <= m && r.admitted > m)
      .map((r) => r.id)
      .sort(),
    plans: d.plans
      .filter((p) => wings.has(ROOM_BY_ID[p.room].wing) && p.at <= m)
      .map((p) => `${p.room} ${p.at} ${p.eta}`)
      .sort(),
  }
}

describe('the live feed', () => {
  it('numbers the log in order of time', () => {
    log.forEach((e, i) => {
      expect(e.seq).toBe(i)
      if (i) expect(e.at).toBeGreaterThanOrEqual(log[i - 1].at)
    })
  })

  it('rebuilds, batch by batch, what the recorded day shows at every reading', () => {
    let live = emptyDay(day.seed)
    let next = 0
    for (let m = 0; m < DAY_MIN; m += STEP) {
      const batch: typeof log = []
      while (next < log.length && log[next].at <= m) batch.push(log[next++])
      live = applyEvents(live, batch)
      expect(reading(live, m), `at ${m}`).toEqual(reading(day, m))
    }
    // 288 batches, each copying every room's readings: the slow path on purpose.
  }, 30_000)

  it('tells the 14:30 story from one sync of the day so far', () => {
    const live = upTo(DEFAULT_TIME)
    expect(census(live, DEFAULT_TIME, WING_BY_CODE[STORY].beds)).toEqual({ occupied: 20, ready: 4, cleaning: 1, dirty: 2, blocked: 1 })
    expect(census(live, DEFAULT_TIME)).toEqual(census(day, DEFAULT_TIME))
    expect(reading(live, DEFAULT_TIME)).toEqual(reading(day, DEFAULT_TIME))
  })

  it('never holds anything from after the minute it has reached', () => {
    for (const m of [0, 7 * 60 + 3, DEFAULT_TIME, 20 * 60 + 17]) {
      const live = upTo(m)
      for (const r of Object.values(live.rooms)) {
        expect(r.spans.every((s) => s.from <= m)).toBe(true)
        expect(r.temp.length).toBeLessThanOrEqual(Math.floor(m / STEP) + 1)
      }
      expect(live.calls.every((c) => c.at <= m)).toBe(true)
      expect(live.alerts.every((a) => a.from <= m)).toBe(true)
      expect(live.requests.every((r) => r.at <= m)).toBe(true)
      expect(live.plans.every((p) => p.at <= m)).toBe(true)
      // Whatever is still going on ends at Infinity, not at the end the recording knows.
      for (const a of live.alerts) if (a.to > m) expect(a.to, a.id).toBe(Infinity)
      for (const c of live.calls) if (c.at + c.wait > m) expect(c.wait).toBe(Infinity)
      for (const r of live.requests) if (r.admitted > m) expect(r.admitted, r.id).toBe(Infinity)
    }
  })

  it('folds an operator action in once, at the minute the server logged it, however often it arrives', () => {
    const action = { id: 'screen-1', alert: 'temp-4A09-740', act: 'ack', by: 'screen' } as const
    const heard = { kind: 'alert-action', action, at: 871.5, seq: 0 } as const
    const live = applyEvents(applyEvents(emptyDay(day.seed), [heard]), [{ ...heard, seq: 1 }])
    expect(live.actions).toEqual([{ ...action, at: 871.5 }])
  })

  it('opens alerts with only what is known then', () => {
    for (const e of log) if (e.kind === 'alert-open' && (e.alert.kind === 'temp' || e.alert.kind === 'call')) expect(e.alert.severity).toBe('warning')
  })

  it('leaves the day it folds into untouched', () => {
    const before = upTo(DEFAULT_TIME)
    const frozen = JSON.stringify(before)
    applyEvents(
      before,
      log.filter((e) => e.at > DEFAULT_TIME && e.at <= DEFAULT_TIME + 120),
    )
    expect(JSON.stringify(before)).toBe(frozen)
  })

  it('sends only plain JSON', () => {
    for (const e of log) expect(JSON.parse(JSON.stringify(e))).toEqual(e)
  })
})
