/// <reference types="node" />
import { once } from 'node:events'
import net from 'node:net'
import { Aedes } from 'aedes'
import mqtt from 'mqtt'
import { SEED, simulate } from '../sim/simulate'
import { DAY_MIN } from '../sim/time'
import { deviceMessages } from './devices'
import type { Message } from './topics'
import { startFeedServer } from './server'

/*
  A whole simulated hospital on this machine, for the twin to connect to
  the way it would to a real one:

    npm run hospital                     the day from 14:30, a minute a second
    npm run hospital -- --start 06:00 --rate 5

  It starts an MQTT broker, the integration server, and the hospital's
  systems replaying the recorded day as raw messages. The day so far goes
  out at once, as a system that has been running all day would have sent
  it; then the clock runs, and at midnight the day starts over.
*/

function option(name: string, fallback: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const [hh, mm] = option('start', '14:30').split(':').map(Number)
const START = Math.min(DAY_MIN - 1, hh * 60 + (mm || 0))
const RATE = Number(option('rate', '1')) || 1
const MQTT_PORT = Number(option('mqtt-port', '1883'))
const FEED_PORT = Number(option('port', '8787'))

const broker = await Aedes.createBroker()
const tcp = net.createServer(broker.handle)
tcp.listen(MQTT_PORT)
await once(tcp, 'listening')
const url = `mqtt://localhost:${MQTT_PORT}`
const feed = await startFeedServer({ broker: url, port: FEED_PORT, report: (line) => console.log(`Feed          ${line}`) })
const devices = await mqtt.connectAsync(url, { clientId: 'cutaway-devices' })

console.log(`MQTT broker   ${url}   (topics under cutaway/, see docs/integration.md)`)
console.log(`Live feed     ws://localhost:${feed.port}`)
console.log(`Open the twin on it: set VITE_FEED_URL=ws://localhost:${feed.port}, run npm run dev, and open ?mode=live`)

const day = simulate(SEED)
let stopped = false
process.on('SIGINT', async () => {
  stopped = true
  await devices.endAsync()
  await feed.close()
  await new Promise<void>((done) => broker.close(() => done()))
  tcp.close()
  process.exit(0)
})

/**
  Publishes the day's messages up to minute `upTo`. Each is sent at QoS 1, so the broker must
  deliver it and the server acknowledges it; at most a few hundred are unacknowledged at once, so
  the day so far goes out as fast as the server takes it in. At QoS 0, a broker under a burst like
  that drops what a subscriber cannot take: it dropped 96 % of the day so far.
*/
async function publish(messages: Iterator<Message>, held: Message | undefined, upTo: number) {
  let n = 0
  const unacknowledged = new Set<Promise<unknown>>()
  let next = held ?? messages.next().value
  while (next && next.payload.at <= upTo) {
    const sent: Promise<unknown> = devices.publishAsync(next.topic, JSON.stringify(next.payload), { qos: 1 }).finally(() => unacknowledged.delete(sent))
    unacknowledged.add(sent)
    if (unacknowledged.size >= 500) await Promise.race(unacknowledged)
    n++
    next = messages.next().value
  }
  await Promise.all(unacknowledged)
  return { next, sent: n }
}

for (let first = true; !stopped; first = false) {
  const messages = deviceMessages(day)
  let minute = first ? START : 0
  const t0 = Date.now()
  const sofar = await publish(messages, undefined, minute)
  let next = sofar.next
  if (first) console.log(`The day so far, to ${String(Math.floor(START / 60)).padStart(2, '0')}:${String(START % 60).padStart(2, '0')}: ${sofar.sent.toLocaleString('en-US')} messages in ${Date.now() - t0} ms`)
  while (!stopped && minute < DAY_MIN - 1) {
    await new Promise((done) => setTimeout(done, 1000 / RATE))
    minute++
    ;({ next } = await publish(messages, next, minute))
  }
  // The last minute's stragglers, then a new day.
  await publish(messages, next, DAY_MIN)
}
