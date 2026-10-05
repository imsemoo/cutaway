import { SEED, simulate } from '../sim/simulate'
import { DAY_MIN } from '../sim/time'
import { toEvents } from './events'
import { createHub } from './hub'
import type { ClientMessage } from './protocol'

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

  The protocol itself lives in hub.ts, which the integration server shares.
  The page reaches this one through mock.ts, as numbered connections that
  carry the same text frames a WebSocket would.
*/

type Pipe = { op: 'boot'; start: number } | { op: 'outage'; ms: number } | { op: 'open' | 'close'; conn: number } | { op: 'send'; conn: number; text: string }

const RATE = 1 // simulated minutes per second

let origin = 0
let startedAt = 0
let downUntil = 0
const open = new Set<number>()

const now = () => Math.min(DAY_MIN, origin + ((Date.now() - startedAt) / 1000) * RATE)
const post = (conn: number, op: 'open' | 'message' | 'close', text?: string) => self.postMessage({ conn, op, text })
const hub = createHub((conn, m) => post(conn, 'message', JSON.stringify(m)))

function startDay(at: number) {
  origin = at
  startedAt = Date.now()
  hub.newDay(toEvents(simulate(SEED)), at)
}

function tick() {
  if (!hub.day) return
  if (now() >= DAY_MIN) startDay(0)
  hub.tick(now())
}

self.onmessage = (e: MessageEvent<Pipe>) => {
  const m = e.data
  switch (m.op) {
    case 'boot':
      if (!hub.day) startDay(m.start)
      break
    case 'outage':
      // The server goes away: every connection drops, and new ones are refused until it is back.
      downUntil = Date.now() + m.ms
      for (const c of open) post(c, 'close')
      open.clear()
      hub.dropAll()
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
      hub.drop(m.conn)
      break
    case 'send': {
      if (!open.has(m.conn)) break
      const message = JSON.parse(m.text) as ClientMessage
      if (message.type === 'subscribe') hub.subscribe(m.conn, message, now())
      else if (message.type === 'act') hub.act(message, now())
      break
    }
  }
}

setInterval(tick, 1000)
