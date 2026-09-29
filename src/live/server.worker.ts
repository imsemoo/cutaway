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

  The page reaches it through mock.ts, as numbered connections that carry
  the same text frames a WebSocket would.
*/

type Pipe = { op: 'boot'; start: number } | { op: 'outage'; ms: number } | { op: 'open' | 'close'; conn: number } | { op: 'send'; conn: number; text: string }

const RATE = 1 // simulated minutes per second
const KEEP = 300 // how many recent events a returning subscriber can catch up on

let day = 0
let log: Stamped[] = []
let sent = 0
let origin = 0
let startedAt = 0
let downUntil = 0
const open = new Set<number>()
const subscribed = new Set<number>()

const now = () => Math.min(DAY_MIN, origin + ((Date.now() - startedAt) / 1000) * RATE)
const post = (conn: number, op: 'open' | 'message' | 'close', text?: string) => self.postMessage({ conn, op, text })
const send = (conn: number, m: ServerMessage) => post(conn, 'message', JSON.stringify(m))

function startDay(at: number) {
  day++
  log = toEvents(simulate(SEED))
  origin = at
  startedAt = Date.now()
  sent = log.findIndex((e) => e.at > at)
  if (sent < 0) sent = log.length
}

function subscribe(conn: number, m: ClientMessage) {
  subscribed.add(conn)
  const missed = m.day === day && m.after !== undefined ? sent - 1 - m.after : -1
  const resume = missed >= 0 && missed <= KEEP
  send(conn, { type: 'sync', day, reset: !resume, events: resume ? log.slice(sent - missed, sent) : log.slice(0, sent), at: now() })
}

function tick() {
  if (!day) return
  if (now() >= DAY_MIN) {
    startDay(0)
    for (const c of subscribed) send(c, { type: 'sync', day, reset: true, events: log.slice(0, sent), at: 0 })
  }
  const at = now()
  for (; sent < log.length && log[sent].at <= at; sent++) {
    for (const c of subscribed) send(c, { type: 'event', day, event: log[sent] })
  }
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
    case 'send':
      if (open.has(m.conn)) subscribe(m.conn, JSON.parse(m.text) as ClientMessage)
      break
  }
}

setInterval(tick, 1000)
