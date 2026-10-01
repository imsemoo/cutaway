import type { Alert, AlertAction, AssetKind, AssetStatus, BedState } from '../data/types'

/*
  The live feed's wire protocol: JSON text frames. The mock server in
  server.worker.ts speaks it, and a real integration layer in front of the
  ADT, BMS, nurse call and RTLS systems would speak the same frames over a
  WebSocket. docs/live-feed.md walks through it.
*/

/** Something that happened on the ward. Readings arrive every five minutes, one frame for all rooms. */
export type WardEvent =
  | { kind: 'bed'; room: string; state: BedState; acuity?: number; note?: string }
  | { kind: 'asset'; id: string; assetKind: AssetKind; loc: string; status: AssetStatus }
  | { kind: 'readings'; slot: number; temp: Record<string, number>; co2: Record<string, number>; battery: Record<string, number> }
  | { kind: 'call'; room: string; pressed: number; on: boolean }
  | { kind: 'alert-open'; alert: Omit<Alert, 'to'> }
  | { kind: 'alert-close'; id: string }
  /** A patient needs a ward bed (`waiting`), or has been given one (`room`). */
  | { kind: 'bed-request'; id: string; wing: string; waiting: boolean; room?: string }
  /** The morning round expects a patient to go home today, at about `eta`. */
  | { kind: 'discharge-plan'; room: string; eta: number }
  /** An operator acknowledged an alert or sent it to a team, on some screen; the server stamps the minute. */
  | { kind: 'alert-action'; action: Omit<AlertAction, 'at'> }

/** An event in the day's log: `seq` counts from 0 each day, `at` is the simulated minute. */
export type Stamped = WardEvent & { seq: number; at: number }

export type ClientMessage =
  /** Asks for the stream. With the last day and seq it has, a client gets only what it missed. */
  | { type: 'subscribe'; day?: number; after?: number }
  /** Something an operator did, on the day it was done. The server logs it once, by its id, and sends it to every screen. */
  | { type: 'act'; day: number; action: Omit<AlertAction, 'at'> }

export type ServerMessage =
  /** The answer to subscribe: the missed events, or with `reset` the whole day so far. */
  | { type: 'sync'; day: number; reset: boolean; events: Stamped[]; at: number }
  | { type: 'event'; day: number; event: Stamped }
  /** Once a second: the server's clock, and the last seq sent, so a client can spot a gap. */
  | { type: 'tick'; day: number; at: number; seq: number }
