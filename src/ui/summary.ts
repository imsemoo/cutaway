import { BED_ROOMS, WINGS } from '../data/floorplan'
import type { Day } from '../data/types'
import { severityAt } from '../lib/alerts'
import { activeAlerts, alertWing, bedAt } from '../lib/query'

export interface WingSummary {
  occupied: number
  beds: number
  alerts: number
  critical: boolean
}

let memo: { day: Day; t: number; out: Map<string, WingSummary> } | undefined

/**
  How full every wing is at minute t, and what is open in it. The building
  map and the overview ask for the same minute, so the last answer is kept.
*/
export function wingSummaries(day: Day, t: number) {
  if (memo?.day === day && memo.t === t) return memo.out
  const out = new Map<string, WingSummary>(WINGS.map((w) => [w.code, { occupied: 0, beds: w.beds.length, alerts: 0, critical: false }]))
  for (const r of BED_ROOMS) if (bedAt(day, r.id, t)?.state === 'occupied') out.get(r.wing)!.occupied++
  for (const a of activeAlerts(day, t)) {
    const s = out.get(alertWing(a) ?? '')
    if (!s) continue
    s.alerts++
    if (severityAt(a, day, t) === 'critical') s.critical = true
  }
  memo = { day, t, out }
  return out
}
