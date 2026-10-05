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

  Each building publishes under a root of its own: the hospital's is
  cutaway, the clinic's cutaway/clinic, so cutaway/clinic/bms/<room> and so
  on (sites.ts).
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

/** The topics under a building's root. */
export const topicsFor = (root: string) => ({
  bms: (room: string) => `${root}/bms/${room}`,
  beds: (room: string) => `${root}/beds/${room}`,
  nursecall: (room: string) => `${root}/nursecall/${room}`,
  rtls: (asset: string) => `${root}/rtls/${asset}`,
  telemetry: (asset: string) => `${root}/telemetry/${asset}`,
  request: (id: string) => `${root}/flow/request/${id}`,
  plan: (room: string) => `${root}/flow/plan/${room}`,
  clock: `${root}/clock`,
  dispatch: (team: Team) => `${root}/dispatch/${team}`,
})
export type Topics = ReturnType<typeof topicsFor>

/** The hospital's topics. */
export const topic = topicsFor(ROOT)

export type Payload = Reading | BedStatus | NurseCall | TagReport | Telemetry | FlowRequest | RoundPlan | Clock

/** A message on its way. */
export interface Message {
  topic: string
  payload: Payload
}
