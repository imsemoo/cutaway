import type { AlertKind, Layer, Severity, View } from '../data/types'
import type { Lang } from '../i18n'
import type { Mode } from '../state/store'

/*
  The messages between Cutaway in an iframe and the page that embeds it.
  docs/embed.md is the reference; bridge.ts speaks it for the twin, and the
  <cutaway-twin> element in element.ts for the host.

  Every message carries `protocol`, so both sides can ignore anything else
  that arrives through postMessage. The twin announces itself with `ready`,
  to any origin and with nothing in it; the host answers `connect`, and from
  then on the twin takes commands only from that origin and posts only to it.
*/
export const PROTOCOL = 'cutaway/1'

/**
  What a host can set: the same names and values as a link's parameters.
  A key left out is left as it is; `select: null` or `''` clears the selection.
*/
export interface Settings {
  at?: string
  select?: string | null
  view?: View
  layer?: Layer
  /** "HH:MM". Replay only: live time is the feed's. */
  t?: string
  mode?: Mode
  lang?: Lang
  /** Replay only. */
  playing?: boolean
}

/** Where the twin stands, in the same terms a host sets it. */
export interface TwinState {
  at: string
  select: string | null
  view: View
  layer: Layer
  t: string
  mode: Mode
  lang: Lang
  playing: boolean
}

/** An alert as the twin shows it at its current minute, worded in its language. */
export interface TwinAlert {
  id: string
  kind: AlertKind
  severity: Severity
  title: string
  text: string
  /** What the alert is about; `set({ select: target.id })` shows it. */
  target: { type: 'room' | 'asset'; id: string }
  /** The room or equipment, named: "Patient room 4A09". */
  where: string
  /** The wing's code: "4A". */
  wing: string
  /** When what it is about began, "HH:MM": the call pressed, the bed vacated. */
  since: string
  /** When the alert opened, "HH:MM". */
  opened: string
}

export type HostMessage = { type: 'connect' } | ({ type: 'set' } & Settings)

export type TwinMessage =
  | { type: 'ready' }
  | { type: 'state'; state: TwinState }
  /** Every alert open at the twin's minute, sent when that list changes. */
  | { type: 'alerts'; alerts: TwinAlert[] }
  /** One alert that opened while the clock ran forward, playing or live. */
  | { type: 'alert'; alert: TwinAlert }
  /** A setting the twin could not apply, and why. The rest of that message was applied. */
  | { type: 'error'; key: string; message: string }

export type Envelope<M> = M & { protocol: typeof PROTOCOL }
