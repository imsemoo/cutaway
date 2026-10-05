import { LIMIT } from '../data/limits'
import type { Alert, CallEvent, RoomDay } from '../data/types'
import { SAMPLES, STEP } from './time'

/*
  The alert rules a simulated day is recorded with, for rooms and call
  lights, shared by the hospital and the clinic. The integration server
  works the same alerts out live (src/integration/engine.ts), by the same
  limits. Alerts carry only facts known when they open; the interface
  words them at the replay minute.
*/

/** The runs of five-minute readings above a limit, at least `readings` long, as [start, end) in minutes. */
export function runsAbove(series: number[], limit: number, readings: number) {
  const runs: [number, number][] = []
  let start = -1
  for (let s = 0; s <= SAMPLES; s++) {
    const high = s < SAMPLES && series[s] > limit
    if (high && start < 0) start = s
    if (!high && start >= 0) {
      if (s - start >= readings) runs.push([start * STEP, s * STEP])
      start = -1
    }
  }
  return runs
}

/** A room too warm, or its air getting stale. */
export function roomAlerts(room: string, env: RoomDay): Alert[] {
  const alerts: Alert[] = []
  for (const [from, to] of runsAbove(env.temp, LIMIT.temp, 1)) {
    const peak = Math.max(...env.temp.slice(from / STEP, to / STEP))
    alerts.push({
      id: `temp-${room}-${from}`, kind: 'temp', from, to, since: from,
      severity: peak > LIMIT.tempCritical ? 'critical' : 'warning',
      target: { type: 'room', id: room },
      title: 'Room too warm',
    })
  }
  // Stale air is flagged at the reading that confirms it, not backdated to the first high one.
  for (const [start, to] of runsAbove(env.co2, LIMIT.co2, LIMIT.co2Readings)) {
    const from = start + (LIMIT.co2Readings - 1) * STEP
    alerts.push({
      id: `co2-${room}-${from}`, kind: 'co2', from, to, since: start,
      severity: 'warning',
      target: { type: 'room', id: room },
      title: 'Air getting stale',
    })
  }
  return alerts
}

/** A call light left waiting past its limit. */
export function callAlerts(calls: CallEvent[]): Alert[] {
  return calls
    .filter((c) => c.wait > LIMIT.call)
    .map((c) => ({
      id: `call-${c.room}-${c.at}`, kind: 'call', from: c.at + LIMIT.call, to: c.at + c.wait, since: c.at,
      severity: c.wait > LIMIT.callCritical ? 'critical' : 'warning',
      target: { type: 'room', id: c.room },
      title: 'Call light unanswered',
    }))
}
