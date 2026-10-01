import { SEED, simulate } from '../sim/simulate'
import { DAY_MIN } from '../sim/time'
import { toEvents } from './events'
import type { ClientMessage, ServerMessage, Stamped } from './protocol'

/*
  The mock server behind the live feed. It publishes the simulated day as
  events, one simulated minute each second, from the minute the page first
  asks for, and keeps going while nobody is connected. A subscriber that
  comes back soon enough gets only what it missed; one that has been away
  too long, or is on yesterday, gets the whole day so far. At midnight the
  day starts over.

  An operator's action comes in as a message, and goes into the log as an
  event at the server's minute, once, however many times it is sent. Every
  subscriber hears it, the screen that sent it included, and a subscriber
  catching up gets it with the rest of what it missed.

  The page reaches it through mock.ts, as numbered connections that carry
  the same text frames a WebSocket would.
*/

type Pipe = { op: 'boot'; start: number } | { op: 'outage'; ms: number } | { op: 'open' | 'close'; conn: number } | { op: 'send'; conn: number; text: string }

const RATE = 1 // simulated minutes per second
// How many recent events a returning subscriber can catch up on: about a minute of the whole hospital.
const KEEP = 2000

let day = 0
let log: Stamped[] = []
let sent = 0
let origin = 0
let startedAt = 0
let downUntil = 0
/** When each of the day's alerts opens, so an action can only be about one that has. */
let opens = new Map<string, number>()
/** The ids of the actions in the log. */
let acted = new Set<string>()
const open = new Set<number>()
const subscribed = new Set<number>()

const now = () => Math.min(DAY_MIN, origin + ((Date.now() - startedAt) / 1000) * RATE)
const post = (conn: number, op: 'open' | 'message' | 'close', text?: string) => self.postMessage({ conn, op, text })
const send = (conn: number, m: ServerMessage) => post(conn, 'message', JSON.stringify(m))

function startDay(at: number) {
  day++
  const recorded = simulate(SEED)
  log = toEvents(recorded)
  opens = new Map(recorded.alerts.map((a) => [a.id, a.from]))
  acted = new Set()
  origin = at
  startedAt = Date.now()
  sent = log.findIndex((e) => e.at > at)
  if (sent < 0) sent = log.length
}

function subscribe(conn: number, m: ClientMessage & { type: 'subscribe' }) {
  subscribed.add(conn)
  const missed = m.day === day && m.after !== undefined ? sent - 1 - m.after : -1
  const resume = missed >= 0 && missed <= KEEP
  send(conn, { type: 'sync', day, reset: !resume, events: resume ? log.slice(sent - missed, sent) : log.slice(0, sent), at: now() })
}

/** Publishes every event that is due by the server's clock. */
function publish(at: number) {
  for (; sent < log.length && log[sent].at <= at; sent++) {
    for (const c of subscribed) send(c, { type: 'event', day, event: log[sent] })
  }
}

/**
  Logs an operator's action now, after everything already due, so the log stays in order of
  time, and publishes it. One for another day, one already logged, or one about an alert that
  has not opened, changes nothing; a real server would also say why.
*/
function act(m: ClientMessage & { type: 'act' }) {
  const at = now()
  const opened = opens.get(m.action.alert)
  if (m.day !== day || acted.has(m.action.id) || opened === undefined || opened > at) return
  publish(at)
  acted.add(m.action.id)
  log.splice(sent, 0, { kind: 'alert-action', action: m.action, at, seq: sent })
  for (let i = sent + 1; i < log.length; i++) log[i].seq = i
  for (const c of subscribed) send(c, { type: 'event', day, event: log[sent] })
  sent++
}

function tick() {
  if (!day) return
  if (now() >= DAY_MIN) {
    startDay(0)
    for (const c of subscribed) send(c, { type: 'sync', day, reset: true, events: log.slice(0, sent), at: 0 })
  }
  const at = now()
  publish(at)
  for (const c of subscribed) send(c, { type: 'tick', day, at, seq: sent - 1 })
}

self.onmessage = (e: MessageEvent<Pipe>) => {
  const m = e.data
  switch (m.op) {
    case 'boot':
      if (!day) startDay(m.start)
      break
    case 'outage':
      // The server goes away: every connection drops, and new ones are refused until it is back.
      downUntil = Date.now() + m.ms
      for (const c of open) post(c, 'close')
      open.clear()
      subscribed.clear()
      break
    case 'open':
      if (Date.now() < downUntil) {
        post(m.conn, 'close')
      } else {
        open.add(m.conn)
        post(m.conn, 'open')
      }
      break
    case 'close':
      open.delete(m.conn)
      subscribed.delete(m.conn)
      break
    case 'send': {
      if (!open.has(m.conn)) break
      const message = JSON.parse(m.text) as ClientMessage
      if (message.type === 'subscribe') subscribe(m.conn, message)
      else if (message.type === 'act') act(message)
      break
    }
  }
}

setInterval(tick, 1000)
