import type { AlertAction } from '../data/types'
import type { ClientMessage, ServerMessage, Stamped } from './protocol'

/*
  The page's end of the live feed. It subscribes, hands over what arrives
  at most once a frame, and keeps the stream whole: every event carries a
  sequence number, so a skipped one, a connection gone quiet or a dropped
  one all end in a subscribe that asks only for what was missed.
  Reconnects back off exponentially, with jitter, so a ward full of
  screens does not come back in step after an outage.

  What an operator does goes the other way, through an outbox: an action
  waits there until the server's log has it, and goes again after every
  reconnect. The server logs an action once, by its id, so sending it
  twice is safe.
*/

/** An action on its way: the server stamps the minute. */
export type Outgoing = Omit<AlertAction, 'at'>

/**
  How the feed reaches a server: a WebSocket in production, the mock
  server in a worker in this demo. Callbacks fire later, never during the call.
*/
export type Transport = (on: { open(): void; message(text: string): void; close(): void }) => { send(text: string): void; close(): void }

export type FeedStatus =
  | { state: 'connecting'; attempt: number }
  /** `caughtUp` counts the events replayed after a reconnect. */
  | { state: 'live'; caughtUp?: number }
  /** `at` is when the next attempt starts, in epoch ms. */
  | { state: 'retrying'; attempt: number; at: number }
  | { state: 'closed' }

export interface FeedHandlers {
  /** Events to fold in order; with `reset`, the day starts over from them. `at` is the server's clock. */
  apply(events: Stamped[], reset: boolean, at: number): void
  status(s: FeedStatus): void
  /** The actions the server's log does not have yet, whenever that changes. */
  pending?(actions: Outgoing[]): void
}

export interface Feed {
  /** Sends an action now if the feed is up, and otherwise once it is back. */
  act(action: Outgoing): void
  /** Closes the feed for good. */
  close(): void
}

export const RETRY = { base: 500, cap: 15_000 }
/** The server ticks every second, so this long without a word means the connection is gone. */
export const SILENCE = 4000

/** The wait before reconnect attempt n, from 0: doubling up to the cap, and a random point in its upper half. */
export function backoff(attempt: number, random = Math.random) {
  const d = Math.min(RETRY.cap, RETRY.base * 2 ** attempt)
  return d / 2 + (random() * d) / 2
}

/** Opens the feed. */
export function openFeed(transport: Transport, on: FeedHandlers, frame: (flush: () => void) => void = requestAnimationFrame): Feed {
  let day: number | undefined
  let last = -1
  let attempt = 0
  let syncing = false
  let stopped = false
  let link: ReturnType<Transport> | undefined
  let token: object | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let silence: ReturnType<typeof setTimeout> | undefined

  // Events wait here for the next frame, so a burst costs one render.
  let queue: Stamped[] = []
  let reset = false
  let clock = 0
  let pending = false
  const flush = () => {
    pending = false
    if (stopped) return
    const events = queue
    queue = []
    on.apply(events, reset, clock)
    reset = false
  }
  const schedule = () => {
    if (pending) return
    pending = true
    frame(flush)
  }

  const subscribe = () => {
    syncing = true
    const m: ClientMessage = day === undefined ? { type: 'subscribe' } : { type: 'subscribe', day, after: last }
    link?.send(JSON.stringify(m))
  }

  // Actions the server's log does not have yet, in the order they were taken.
  const outbox = new Map<string, Outgoing>()
  const report = () => on.pending?.([...outbox.values()])
  const post = (action: Outgoing) => {
    if (day === undefined || syncing || !link) return
    const m: ClientMessage = { type: 'act', day, action }
    link.send(JSON.stringify(m))
  }
  const logged = (events: Stamped[]) => {
    let heard = false
    for (const e of events) if (e.kind === 'alert-action') heard = outbox.delete(e.action.id) || heard
    if (heard) report()
  }

  const listen = () => {
    clearTimeout(silence)
    silence = setTimeout(drop, SILENCE)
  }

  const receive = (m: ServerMessage) => {
    listen()
    if (m.type === 'sync') {
      syncing = false
      if (m.reset) {
        queue = []
        reset = true
      }
      // An action belongs to the day it was taken on: on a new day its alert is another one.
      if (day !== undefined && m.day !== day && outbox.size) {
        outbox.clear()
        report()
      }
      day = m.day
      queue.push(...m.events)
      last = m.events.at(-1)?.seq ?? (m.reset ? -1 : last)
      clock = m.at
      attempt = 0
      on.status({ state: 'live', caughtUp: m.reset ? undefined : m.events.length })
      logged(m.events)
      outbox.forEach(post)
    } else if (syncing) {
      return // anything sent before the server answered is in its answer
    } else if (m.type === 'event') {
      if (m.day !== day || m.event.seq !== last + 1) return subscribe()
      last = m.event.seq
      queue.push(m.event)
      logged([m.event])
    } else {
      if (m.day !== day || m.seq !== last) return subscribe()
      clock = m.at
    }
    schedule()
  }

  function dial() {
    on.status({ state: 'connecting', attempt })
    const mine = (token = {})
    link = transport({
      open: () => mine === token && subscribe(),
      message: (text) => {
        if (mine !== token) return
        let m: ServerMessage
        try {
          m = JSON.parse(text)
        } catch {
          return drop()
        }
        receive(m)
      },
      close: () => mine === token && drop(),
    })
    listen()
  }

  function hangUp() {
    clearTimeout(silence)
    token = undefined
    link?.close()
    link = undefined
  }

  function drop() {
    hangUp()
    if (stopped) return
    const wait = backoff(attempt)
    attempt++
    on.status({ state: 'retrying', attempt, at: Date.now() + wait })
    retry = setTimeout(dial, wait)
  }

  dial()
  return {
    act: (action) => {
      outbox.set(action.id, action)
      report()
      post(action)
    },
    close: () => {
      stopped = true
      clearTimeout(retry)
      hangUp()
      on.status({ state: 'closed' })
    },
  }
}

/** The transport for a real server: VITE_FEED_URL=wss://… at build time. */
export const webSocketTransport =
  (url: string): Transport =>
  (on) => {
    const ws = new WebSocket(url)
    ws.onopen = () => on.open()
    ws.onmessage = (e) => on.message(String(e.data))
    ws.onclose = () => on.close()
    return { send: (text) => ws.send(text), close: () => ws.close() }
  }
