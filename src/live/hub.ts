import type { ClientMessage, ServerMessage, Stamped, WardEvent } from './protocol'

/*
  The server's side of the feed protocol, whatever stands behind it: the
  day's log of numbered events, who is subscribed and what each has been
  sent, and the operators' actions. The demo's mock server
  (server.worker.ts) and the integration server (integration/server.ts)
  both speak through it; they differ only in where events come from and
  how text reaches a screen.

  A log can hold events still to come, as the mock's recorded day does:
  they go out as the clock reaches them. Events that happen now are
  appended after everything already due, so the log stays in order of time.
*/

/** How many recent events a returning subscriber can catch up on: about a minute of the whole hospital. */
export const KEEP = 2000

export type Timed = WardEvent & { at: number }

export function createHub(send: (conn: number, m: ServerMessage) => void) {
  let day = 0
  let log: Stamped[] = []
  let sent = 0
  /** When each alert in the log opens, so an action can only be about one that has. */
  let opens = new Map<string, number>()
  /** The ids of the actions in the log. */
  let acted = new Set<string>()
  const subscribed = new Set<number>()

  const broadcast = (m: ServerMessage) => {
    for (const c of subscribed) send(c, m)
  }
  const note = (e: Stamped) => {
    if (e.kind === 'alert-open') opens.set(e.alert.id, e.at)
  }
  /** Publishes every event in the log that is due by minute `at`. */
  const release = (at: number) => {
    for (; sent < log.length && log[sent].at <= at; sent++) broadcast({ type: 'event', day, event: log[sent] })
  }
  /** Puts an event in the log after everything sent, renumbers what follows, and publishes it. */
  const insert = (e: Timed) => {
    const event = { ...e, seq: sent } as Stamped
    log.splice(sent, 0, event)
    for (let i = sent + 1; i < log.length; i++) log[i].seq = i
    note(event)
    broadcast({ type: 'event', day, event })
    sent++
    return event
  }

  return {
    get day() {
      return day
    },
    /** Starts a new day from its log; whatever is due by `at` counts as the day so far. Subscribers start over with it. */
    newDay(events: Timed[], at: number) {
      day++
      log = events.map((e, seq) => ({ ...e, seq }) as Stamped)
      opens = new Map()
      for (const e of log) note(e)
      acted = new Set()
      sent = log.findIndex((e) => e.at > at)
      if (sent < 0) sent = log.length
      broadcast({ type: 'sync', day, reset: true, events: log.slice(0, sent), at })
    },
    /** Logs events that happen now, at minute `at`, and publishes them. */
    append(events: Timed[], at: number) {
      release(at)
      for (const e of events) insert(e)
    },
    /** Publishes what is due by `at`, then the clock, so a screen can tell it is still connected and spot a gap. */
    tick(at: number) {
      release(at)
      broadcast({ type: 'tick', day, at, seq: sent - 1 })
    },
    /** Answers a subscribe: only what the screen missed, or the whole day so far when that is too much or it is on another day. */
    subscribe(conn: number, m: ClientMessage & { type: 'subscribe' }, at: number) {
      subscribed.add(conn)
      const missed = m.day === day && m.after !== undefined ? sent - 1 - m.after : -1
      const resume = missed >= 0 && missed <= KEEP
      send(conn, { type: 'sync', day, reset: !resume, events: resume ? log.slice(sent - missed, sent) : log.slice(0, sent), at })
    },
    /**
      Logs an operator's action at minute `at` and returns its event. One for another day, one
      already logged, or one about an alert that has not opened, changes nothing; a real server
      would also say why.
    */
    act(m: ClientMessage & { type: 'act' }, at: number): Stamped | undefined {
      const opened = opens.get(m.action.alert)
      if (m.day !== day || acted.has(m.action.id) || opened === undefined || opened > at) return undefined
      release(at)
      acted.add(m.action.id)
      return insert({ kind: 'alert-action', action: m.action, at })
    },
    drop(conn: number) {
      subscribed.delete(conn)
    },
    dropAll() {
      subscribed.clear()
    },
  }
}
