export type RoomKind = 'patient' | 'icu' | 'station' | 'support' | 'lounge' | 'core'
export type Side = 'n' | 's' | 'e' | 'w'

export interface Room {
  id: string
  name: string
  kind: RoomKind
  level: number
  /** The wing's code, such as 4A. */
  wing: string
  /** Plan rectangle in metres on its level: x runs east, z runs south. */
  x: number
  z: number
  w: number
  d: number
  /** Door opening: which wall, and the offset of its centre from that wall's start. */
  door?: { side: Side; at: number; width: number }
  /** Wall facing the corridor is glass (ICU bays). */
  glass?: Side
  /** Counter-height walls instead of full-height ones. */
  low?: boolean
  /** Which wall the bed head sits against. */
  head?: Side
}

export type BedState = 'occupied' | 'dirty' | 'cleaning' | 'ready' | 'blocked'

export interface BedSpan {
  from: number
  to: number
  state: BedState
  /** 1 (stable) to 4 (highest care need), occupied spans only. */
  acuity?: number
  note?: string
}

export interface CallEvent {
  room: string
  at: number
  /** Minutes until a nurse answered. */
  wait: number
}

export type AssetKind = 'pump' | 'vent' | 'chair' | 'xray' | 'scanner'
export type AssetStatus = 'in-use' | 'available' | 'needs-cleaning' | 'charging'

export interface AssetSpan {
  from: number
  to: number
  loc: string
  status: AssetStatus
}

export interface Asset {
  id: string
  kind: AssetKind
  /** Equipment belongs to one wing and moves only within it. */
  wing: string
  spans: AssetSpan[]
  /** Battery % every 5 minutes, pumps only. */
  battery?: number[]
}

export type Severity = 'critical' | 'warning' | 'info'
export type AlertKind = 'temp' | 'co2' | 'call' | 'dirty' | 'ready' | 'battery'

export interface Alert {
  id: string
  kind: AlertKind
  from: number
  to: number
  severity: Severity
  target: { type: 'room' | 'asset'; id: string }
  title: string
  /** When the underlying event started: call pressed, bed vacated, bed ready. */
  since: number
}

/** The team an alert is sent to. */
export type Team = 'nursing' | 'housekeeping' | 'facilities' | 'bed-management'

/** Something an operator did about an alert, at a minute of the day. */
export interface AlertAction {
  /** Unique, so an action sent twice over a feed is counted once. */
  id: string
  alert: string
  act: 'ack' | 'send'
  at: number
  /** Who it was sent to, for `send`. */
  team?: Team
  /** The screen it came from, on a live feed; none in replay, where it is the person at this one. */
  by?: string
}

/** A patient who needs a ward bed: from ED, theatre or another ward. */
export interface BedRequest {
  id: string
  wing: string
  at: number
  /** When the patient got a bed; Infinity while they wait (live). */
  admitted: number
  /** The bed they got, once they have. */
  room?: string
}

/** A discharge expected today, as the morning board round noted it. */
export interface DischargePlan {
  room: string
  /** When it was noted. */
  at: number
  /** When the patient is expected to leave. Plans slip: it is an estimate. */
  eta: number
}

export interface RoomDay {
  spans: BedSpan[]
  /** Samples every 5 minutes, 289 values from 00:00 to 24:00. */
  temp: number[]
  co2: number[]
}

export interface Day {
  seed: number
  rooms: Record<string, RoomDay>
  calls: CallEvent[]
  assets: Asset[]
  alerts: Alert[]
  requests: BedRequest[]
  plans: DischargePlan[]
  actions: AlertAction[]
}

export type Layer = 'beds' | 'temp' | 'air' | 'calls'
export type View = '3d' | 'plan' | 'list'
export type Selection = { type: 'room' | 'asset'; id: string }
