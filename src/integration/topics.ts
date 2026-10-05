import type { AssetKind, AssetStatus, BedState, Team } from '../data/types'

/*
  What the hospital's systems publish, as the integration server hears
  them over MQTT: one topic per thing, a small JSON payload, and `at`, the
  minute of the day it happened. In a hospital each group of topics comes
  from its own system, usually through a gateway that speaks MQTT for it;
  docs/integration.md maps them one by one.

  cutaway/bms/<room>              building sensors, every five minutes
  cutaway/beds/<room>             bed status: admissions, discharges, housekeeping
  cutaway/nursecall/<room>        a call light going on or off
  cutaway/rtls/<asset>            where a tracked asset is, and in what state
  cutaway/telemetry/<asset>       a pump's battery, every five minutes
  cutaway/flow/request/<id>       a patient asking for a ward bed, and getting one
  cutaway/flow/plan/<room>        a discharge the morning round expects
  cutaway/clock                   the minute of the day, once a minute

  And one the server publishes, for the teams' own systems:

  cutaway/dispatch/<team>         an alert an operator sent to that team
*/

export const ROOT = 'cutaway'

export interface Reading {
  at: number
  /** °C */
  temp: number
  /** ppm */
  co2: number
}
export interface BedStatus {
  at: number
  state: BedState
  acuity?: number
  note?: string
}
export interface NurseCall {
  at: number
  on: boolean
  /** The minute it was pressed, which names the call. */
  pressed: number
}
export interface TagReport {
  at: number
  kind: AssetKind
  /** The room it is in. */
  loc: string
  status: AssetStatus
}
export interface Telemetry {
  at: number
  /** % */
  battery: number
}
export interface FlowRequest {
  at: number
  wing: string
  waiting: boolean
  /** The bed given, once the patient has one. */
  room?: string
}
export interface RoundPlan {
  at: number
  /** The minute the patient is expected to go. */
  eta: number
}
export interface Clock {
  at: number
}
export interface Dispatch {
  at: number
  /** The action's id, so a team's system can tell a repeat. */
  id: string
  alert: string
  team: Team
  /** The screen it was sent from. */
  by?: string
}

export const topic = {
  bms: (room: string) => `${ROOT}/bms/${room}`,
  beds: (room: string) => `${ROOT}/beds/${room}`,
  nursecall: (room: string) => `${ROOT}/nursecall/${room}`,
  rtls: (asset: string) => `${ROOT}/rtls/${asset}`,
  telemetry: (asset: string) => `${ROOT}/telemetry/${asset}`,
  request: (id: string) => `${ROOT}/flow/request/${id}`,
  plan: (room: string) => `${ROOT}/flow/plan/${room}`,
  clock: `${ROOT}/clock`,
  dispatch: (team: Team) => `${ROOT}/dispatch/${team}`,
}

export type Payload = Reading | BedStatus | NurseCall | TagReport | Telemetry | FlowRequest | RoundPlan | Clock

/** A message on its way. */
export interface Message {
  topic: string
  payload: Payload
}
