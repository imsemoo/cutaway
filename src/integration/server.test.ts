/// <reference types="node" />
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import net, { type AddressInfo } from 'node:net'
import { Aedes } from 'aedes'
import mqtt from 'mqtt'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { CLINIC_SEED, simulateClinic } from '../clinic/simulate'
import type { Building } from '../data/building'
import { STORY, WING_BY_CODE } from '../data/floorplan'
import type { Day } from '../data/types'
import { applyEvents, emptyDay } from '../live/events'
import { openFeed, type Feed, type Transport } from '../live/feed'
import { activeAlerts, bedAt, census } from '../lib/query'
import { SEED, simulate } from '../sim/simulate'
import { DEFAULT_TIME } from '../state/store'
import { deviceMessages } from './devices'
import { startFeedServer, type FeedServer } from './server'
import { clinicSite } from './sites'
import { topic, topicsFor, type Dispatch } from './topics'

/** The feed's transport over the ws package, which Node 20 needs. */
const wsTransport =
  (url: string): Transport =>
  (on) => {
    const ws = new WebSocket(url)
    ws.on('open', () => on.open())
    ws.on('message', (data) => on.message(String(data)))
    ws.on('close', () => on.close())
    return { send: (text) => ws.send(text), close: () => ws.close() }
  }

const wing = WING_BY_CODE[STORY]
const recorded = simulate(SEED, [wing])

let broker: Awaited<ReturnType<typeof Aedes.createBroker>>
let tcp: net.Server
let server: FeedServer
let url = ''

beforeAll(async () => {
  broker = await Aedes.createBroker()
  tcp = net.createServer(broker.handle).listen(0, '127.0.0.1')
  await once(tcp, 'listening')
  url = `mqtt://127.0.0.1:${(tcp.address() as AddressInfo).port}`
  server = await startFeedServer({ broker: url, port: 0, tickMs: 100 })
})

afterAll(async () => {
  await server.close()
  await new Promise<void>((done) => broker.close(() => done()))
  tcp.close()
})

describe('the integration server', () => {
  it('serves what the systems publish as the live feed, and dispatches an alert sent to a team', async () => {
    const teams = await mqtt.connectAsync(url)
    const heard: Dispatch[] = []
    teams.on('message', (_, body) => heard.push(JSON.parse(body.toString())))
    await teams.subscribeAsync(topic.dispatch('facilities'))

    // The story wing's systems, up to 14:30.
    const devices = await mqtt.connectAsync(url)
    for (const m of deviceMessages(recorded)) {
      if (m.payload.at > DEFAULT_TIME) break
      devices.publish(m.topic, JSON.stringify(m.payload))
    }

    // A screen subscribes, and folds what arrives into its day.
    let day: Day = emptyDay(SEED)
    let feed: Feed | undefined
    try {
      feed = openFeed(wsTransport(`ws://127.0.0.1:${server.port}`), { apply: (events, reset) => (day = applyEvents(reset ? emptyDay(SEED) : day, events)), status: () => {} }, (flush) => setTimeout(flush, 0))
      const open = (d: Day) => activeAlerts(d, DEFAULT_TIME).map((a) => a.id).sort()
      await vi.waitFor(() => expect(open(day)).toEqual(open(recorded)), { timeout: 20_000, interval: 100 })
      expect(census(day, DEFAULT_TIME, wing.beds)).toEqual(census(recorded, DEFAULT_TIME, wing.beds))

      // Sent to facilities from the screen: logged for every screen, and published for the team.
      const warm = activeAlerts(day, DEFAULT_TIME).find((a) => a.kind === 'temp')!
      feed.act({ id: 'screen-1', alert: warm.id, act: 'send', team: 'facilities', by: 'screen' })
      await vi.waitFor(() => expect(day.actions.map((a) => a.id)).toEqual(['screen-1']), { timeout: 10_000, interval: 50 })
      await vi.waitFor(() => expect(heard).toMatchObject([{ id: 'screen-1', alert: warm.id, team: 'facilities', by: 'screen' }]), { timeout: 10_000, interval: 50 })
      // The same action again, as after a reconnect, is logged once.
      feed.act({ id: 'screen-1', alert: warm.id, act: 'send', team: 'facilities', by: 'screen' })
      await new Promise((done) => setTimeout(done, 300))
      expect(day.actions).toHaveLength(1)
      expect(heard).toHaveLength(1)
    } finally {
      feed?.close()
      await devices.endAsync()
      await teams.endAsync()
    }
  }, 30_000)

  it('serves the clinic as a site of its own, from its own topics, on a feed of its own', async () => {
    const building: Building = JSON.parse(readFileSync('public/buildings/clinic.json', 'utf8'))
    const site = clinicSite(building)
    const recorded = simulateClinic(building)
    const rooms = building.spaces.map((s) => s.id)
    const clinic = await startFeedServer({ broker: url, port: 0, tickMs: 100, site })
    const devices = await mqtt.connectAsync(url)
    let feed: Feed | undefined
    try {
      for (const m of deviceMessages(recorded, topicsFor(site.root))) {
        if (m.payload.at > DEFAULT_TIME) break
        devices.publish(m.topic, JSON.stringify(m.payload))
      }
      let day: Day = emptyDay(CLINIC_SEED, rooms)
      feed = openFeed(wsTransport(`ws://127.0.0.1:${clinic.port}`), { apply: (events, reset) => (day = applyEvents(reset ? emptyDay(CLINIC_SEED, rooms) : day, events)), status: () => {} }, (flush) => setTimeout(flush, 0))
      const open = (d: Day) => activeAlerts(d, DEFAULT_TIME).map((a) => a.id).sort()
      await vi.waitFor(() => expect(open(day)).toEqual(open(recorded)), { timeout: 20_000, interval: 100 })
      const care = building.spaces.filter((s) => s.kind === 'care').map((s) => s.id)
      const states = (d: Day) => care.map((id) => bedAt(d, id, DEFAULT_TIME)?.state)
      expect(states(day)).toEqual(states(recorded))
      // Nothing of the hospital reaches it.
      expect(Object.keys(day.rooms)).toEqual(rooms)
    } finally {
      feed?.close()
      await devices.endAsync()
      await clinic.close()
    }
  }, 30_000)

  it('closes a connection that sends anything but the feed protocol', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    await once(ws, 'open')
    ws.send(JSON.stringify({ type: 'act', day: 1, action: { id: 'x', alert: 'temp-4A09-730', act: 'delete-everything' } }))
    const [code] = await once(ws, 'close')
    expect(code).toBe(1003)
  })
})
