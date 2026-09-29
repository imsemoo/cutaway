import { BED_ROOMS, ROOM_BY_ID, isBed, wingOfAsset, type Wing } from '../data/floorplan'
import type { Alert, Asset, AssetKind, AssetSpan, AssetStatus, BedSpan, BedState, Day, Room } from '../data/types'
import { plural, say } from '../i18n'
import { DAY_MIN, STEP } from '../sim/time'

export const clock = (m: number) => {
  const mm = Math.max(0, Math.min(DAY_MIN, Math.round(m)))
  return `${String(Math.floor(mm / 60) % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

const minutes = (n: number) => plural(n, '{n} min', '{n} min')

export const duration = (min: number) => {
  const m = Math.round(min)
  if (m < 60) return minutes(m)
  const hours = plural(Math.floor(m / 60), '{n} h', '{n} h')
  return m % 60 ? say('{hours} {minutes}', { hours, minutes: minutes(m % 60) }) : hours
}

/** A walk as a person would say it: "40 s away", "3 min away". */
export const walking = (seconds: number) =>
  seconds < 60 ? plural(Math.max(5, Math.round(seconds / 5) * 5), '{n} s away', '{n} s away') : plural(Math.round(seconds / 60), '{n} min away', '{n} min away')

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

/** "Level 4, A wing": how a person names a wing. */
export const wingName = (w: Wing) => say('Level {level}, {wing} wing', { level: w.level, wing: w.code.slice(1) })

/** A room's full name: "Patient room 4A09", "Equipment store". */
function fullName(r: Room) {
  if (r.kind === 'patient') return say('Patient room {id}', { id: r.id })
  if (r.kind === 'icu') return say('ICU bay {id}', { id: r.id })
  return say(r.name)
}
export const roomName = (id: string) => (ROOM_BY_ID[id] ? fullName(ROOM_BY_ID[id]) : id)
/** A room as a label names it: a bed room by its number, any other by what it is. */
export const roomTitle = (r: Room) => (isBed(r) ? r.id : say(r.name))

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

/** The labels in the language on show; the maps above are their English keys. */
export const bedLabel = (s: BedState) => say(BED_LABEL[s])
export const assetLabel = (k: AssetKind) => say(ASSET_LABEL[k])
export const statusLabel = (s: AssetStatus) => say(ASSET_STATUS_LABEL[s])
