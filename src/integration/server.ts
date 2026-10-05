/// <reference types="node" />
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import mqtt from 'mqtt'
import { WebSocketServer, type WebSocket } from 'ws'
import type { AlertAction, Team } from '../data/types'
import { createHub } from '../live/hub'
import type { ClientMessage } from '../live/protocol'
import { createEngine } from './engine'
import { ROOT, topic, type Dispatch } from './topics'

/*
  The integration server. It subscribes to the hospital's topics on an MQTT
  broker, runs what arrives through the engine, and serves the result as the
  live feed over WebSocket, in the same protocol as the demo's mock, so the
  twin connects to it with VITE_FEED_URL and nothing else changes. An
  operator's action from any screen is logged, sent to every screen, and,
  when it sends an alert to a team, published on MQTT for that team's own
  system.

  The clock comes from the clock topic; when it goes back, a new day has
  begun and every screen starts over. The server does no authentication of
  its own: a deployment puts it behind the hospital's gateway.
*/

const INBOUND = ['bms/+', 'beds/+', 'nursecall/+', 'rtls/+', 'telemetry/+', 'flow/request/+', 'flow/plan/+', 'clock'].map((t) => `${ROOT}/${t}`)
const TEAMS = new Set<Team>(['nursing', 'housekeeping', 'facilities', 'bed-management'])

/** A screen's message, checked field by field and rebuilt, so nothing else it carried reaches the log or the other screens. */
function read(text: string): ClientMessage | undefined {
  let m: Record<string, unknown>
  try {
    m = JSON.parse(text)
  } catch {
    return undefined
  }
  const day = typeof m?.day === 'number' ? m.day : undefined
  if (m?.type === 'subscribe') return { type: 'subscribe', ...(day !== undefined && { day }), ...(typeof m.after === 'number' && { after: m.after }) }
  const a = m?.type === 'act' ? (m.action as Record<string, unknown> | null) : null
  if (!a || day === undefined || typeof a.id !== 'string' || typeof a.alert !== 'string') return undefined
  if (a.act !== 'ack' && !(a.act === 'send' && TEAMS.has(a.team as Team))) return undefined
  const action: Omit<AlertAction, 'at'> = {
    id: a.id.slice(0, 64),
    alert: a.alert.slice(0, 64),
    act: a.act,
    ...(a.act === 'send' && { team: a.team as Team }),
    ...(typeof a.by === 'string' && { by: a.by.slice(0, 32) }),
  }
  return { type: 'act', day, action }
}

export interface FeedServer {
  /** The port the feed listens on, useful when it was asked for any free one. */
  port: number
  close(): Promise<void>
}

export async function startFeedServer({
  broker,
  port = 8787,
  tickMs = 1000,
  report,
}: {
  broker: string
  port?: number
  tickMs?: number
  /** Where to say, every ten seconds, what has come in and gone out. */
  report?: (line: string) => void
}): Promise<FeedServer> {
  const mq = await mqtt.connectAsync(broker, { clientId: `cutaway-feed-${process.pid}-${Date.now()}` })
  const sockets = new Map<number, WebSocket>()
  const hub = createHub((conn, m) => sockets.get(conn)?.send(JSON.stringify(m)))
  let engine = createEngine()
  let clock = 0
  let received = 0
  let logged = 0
  hub.newDay([], 0)

  mq.on('message', (t, body) => {
    let payload: unknown
    try {
      payload = JSON.parse(body.toString())
    } catch {
      return
    }
    if (t === topic.clock) {
      const at = (payload as { at?: unknown } | null)?.at
      if (typeof at === 'number') {
        if (at < clock) {
          engine = createEngine()
          hub.newDay([], at)
        }
        clock = at
      }
    }
    received++
    const events = engine.ingest(t, payload)
    logged += events.length
    if (events.length) hub.append(events, clock)
  })
  // At QoS 1, so a burst is delivered rather than thinned.
  await mq.subscribeAsync(INBOUND, { qos: 1 })

  const wss = new WebSocketServer({ port, maxPayload: 16 * 1024 })
  await once(wss, 'listening')
  let count = 0
  wss.on('connection', (ws) => {
    const conn = ++count
    sockets.set(conn, ws)
    ws.on('message', (data) => {
      const m = read(String(data))
      if (!m) return ws.close(1003, 'Not a feed message')
      if (m.type === 'subscribe') return hub.subscribe(conn, m, clock)
      const event = hub.act(m, clock)
      if (event?.kind === 'alert-action' && event.action.act === 'send' && event.action.team) {
        const out: Dispatch = { at: event.at, id: event.action.id, alert: event.action.alert, team: event.action.team, ...(event.action.by && { by: event.action.by }) }
        mq.publish(topic.dispatch(event.action.team), JSON.stringify(out), { qos: 1 })
      }
    })
    ws.on('close', () => {
      sockets.delete(conn)
      hub.drop(conn)
    })
  })
  const timer = setInterval(() => hub.tick(clock), tickMs)
  const said = report
    ? setInterval(() => report(`${clock.toFixed(1)} min: ${received.toLocaleString('en-US')} messages in, ${engine.dropped} dropped, ${logged.toLocaleString('en-US')} events logged, ${sockets.size} screens`), 10_000)
    : undefined

  return {
    port: (wss.address() as AddressInfo).port,
    async close() {
      clearInterval(timer)
      clearInterval(said)
      for (const ws of sockets.values()) ws.terminate()
      await new Promise((done) => wss.close(done))
      await mq.endAsync()
    },
  }
}
