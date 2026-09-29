import { BED_ROOMS, ROOM_BY_ID, wingOfAsset } from '../data/floorplan'
import type { Alert, Asset, AssetSpan, BedSpan, BedState, Day, Room } from '../data/types'
import { DAY_MIN, STEP } from '../sim/time'

export const clock = (m: number) => {
  const mm = Math.max(0, Math.min(DAY_MIN, Math.round(m)))
  return `${String(Math.floor(mm / 60) % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

export const duration = (min: number) => {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

export function spanAt<T extends { from: number; to: number }>(list: T[] | undefined, m: number): T | undefined {
  if (!list) return undefined
  for (const s of list) if (m >= s.from && m < s.to) return s
  return list[list.length - 1]?.to === m ? list[list.length - 1] : undefined
}

/** Linear read of a 5-minute series at any minute. A live series ends at its latest reading, which holds until the next. */
export function sample(series: number[], m: number) {
  const last = series.length - 1
  const f = Math.max(0, Math.min(last, m / STEP))
  const i = Math.floor(f)
  const j = Math.min(last, i + 1)
  return series[i] + (series[j] - series[i]) * (f - i)
}

export function bedAt(day: Day, roomId: string, m: number): BedSpan | undefined {
  return spanAt(day.rooms[roomId]?.spans, m)
}

export function assetAt(asset: Asset, m: number): AssetSpan {
  return spanAt(asset.spans, m) ?? asset.spans[asset.spans.length - 1]
}

export function batteryAt(asset: Asset, m: number) {
  return asset.battery ? Math.round(sample(asset.battery, m)) : undefined
}

export const activeAlerts = (day: Day, m: number) => day.alerts.filter((a) => m >= a.from && m < a.to)

export function activeCall(day: Day, roomId: string, m: number) {
  return day.calls.find((c) => c.room === roomId && m >= c.at && m < c.at + c.wait)
}

/** Beds by state at minute m, across the hospital or in the rooms given. */
export function census(day: Day, m: number, beds: Room[] = BED_ROOMS) {
  const counts: Record<BedState, number> = { occupied: 0, dirty: 0, cleaning: 0, ready: 0, blocked: 0 }
  for (const r of beds) {
    const s = bedAt(day, r.id, m)
    if (s) counts[s.state]++
  }
  return counts
}

export function assetsIn(day: Day, roomId: string, m: number) {
  return day.assets.filter((a) => assetAt(a, m).loc === roomId)
}

export const roomName = (id: string) => ROOM_BY_ID[id]?.name ?? id

/** The wing an alert belongs to: its room's, or its equipment's. */
export const alertWing = (alert: Alert) => (alert.target.type === 'room' ? ROOM_BY_ID[alert.target.id]?.wing : wingOfAsset(alert.target.id))

export const BED_LABEL: Record<BedState, string> = {
  occupied: 'Occupied',
  dirty: 'Waiting for cleaning',
  cleaning: 'Cleaning',
  ready: 'Clean and ready',
  blocked: 'Out of service',
}

export const ASSET_LABEL = {
  pump: 'Infusion pump',
  vent: 'Ventilator',
  chair: 'Wheelchair',
  xray: 'Portable X-ray',
  scanner: 'Bladder scanner',
} as const

export const ASSET_STATUS_LABEL = {
  'in-use': 'In use',
  available: 'Available',
  'needs-cleaning': 'Needs cleaning',
  charging: 'Charging',
} as const
