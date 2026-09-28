import type { Alert, Day, Severity } from '../data/types'
import { batteryAt, clock, duration, sample } from './query'

/** What an alert says at minute t: only what an operator could know by then. */
export function describe(alert: Alert, day: Day, t: number): string {
  const since = Math.max(0, t - alert.since)
  switch (alert.kind) {
    case 'temp':
      return `${sample(day.rooms[alert.target.id].temp, t).toFixed(1)} °C now, limit 25.5 °C. Check the room's air handling.`
    case 'co2':
      return `${Math.round(sample(day.rooms[alert.target.id].co2, t)).toLocaleString('en-US')} ppm now, limit 1,000. Open up ventilation or thin out visitors.`
    case 'call':
      return `Pressed at ${clock(alert.since)}, ${duration(since)} without an answer.`
    case 'dirty':
      return `Empty since ${clock(alert.since)}, ${duration(since)} without cleaning. The next admission cannot use it.`
    case 'ready':
      return `Clean since ${clock(alert.since)}, no patient assigned for ${duration(since)}.`
    case 'battery': {
      const asset = day.assets.find((a) => a.id === alert.target.id)
      return `${asset ? batteryAt(asset, t) : '?'} % and in use. Plug it into mains.`
    }
  }
}

/** Severity as it stands at minute t, so a warm room is not called critical before it is. */
export function severityAt(alert: Alert, day: Day, t: number): Severity {
  switch (alert.kind) {
    case 'temp':
      return sample(day.rooms[alert.target.id].temp, t) > 26.5 ? 'critical' : 'warning'
    case 'call':
      return t - alert.since > 10 ? 'critical' : 'warning'
    default:
      return alert.severity
  }
}
