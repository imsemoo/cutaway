import type { Alert, AlertKind, Day, Severity } from '../data/types'
import { say } from '../i18n'
import { batteryAt, clock, duration, sample } from './query'

/** Each kind's title, in English; alertTitle gives it in the language on show. */
export const ALERT_TITLE: Record<AlertKind, string> = {
  temp: 'Room too warm',
  co2: 'Air getting stale',
  call: 'Call light unanswered',
  dirty: 'Bed waiting for cleaning',
  ready: 'Clean bed not assigned',
  battery: 'Pump battery low',
}
export const alertTitle = (alert: Alert) => say(ALERT_TITLE[alert.kind])

/** What an alert says at minute t: only what an operator could know by then. */
export function describe(alert: Alert, day: Day, t: number): string {
  const at = clock(alert.since)
  const wait = duration(Math.max(0, t - alert.since))
  switch (alert.kind) {
    case 'temp':
      return say("{v} °C now, limit 25.5 °C. Check the room's air handling.", { v: sample(day.rooms[alert.target.id].temp, t).toFixed(1) })
    case 'co2':
      return say('{v} ppm now, limit 1,000. Open up ventilation or thin out visitors.', {
        v: Math.round(sample(day.rooms[alert.target.id].co2, t)).toLocaleString('en-US'),
      })
    case 'call':
      return say('Pressed at {at}, {wait} without an answer.', { at, wait })
    case 'dirty':
      return say('Empty since {at}, {wait} without cleaning. The next admission cannot use it.', { at, wait })
    case 'ready':
      return say('Clean since {at}, no patient assigned for {wait}.', { at, wait })
    case 'battery': {
      const asset = day.assets.find((a) => a.id === alert.target.id)
      return say('{v} % and in use. Plug it into mains.', { v: asset ? (batteryAt(asset, t) ?? '?') : '?' })
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

