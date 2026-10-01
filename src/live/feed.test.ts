import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETRY, SILENCE, backoff, openFeed, type FeedStatus, type Transport } from './feed'
import type { ClientMessage, ServerMessage, Stamped } from './protocol'

const ev = (seq: number, at = seq): Stamped => ({ seq, at, kind: 'call', room: '4A01', pressed: at, on: true })

/** A stand-in server: each connection records what the page sends, and the test speaks for the server. */
function harness() {
  const links: { sent: ClientMessage[]; closed: boolean; on: Parameters<Transport>[0] }[] = []
  const transport: Transport = (on) => {
    const link = { sent: [] as ClientMessage[], closed: false, on }
    links.push(link)
    return { send: (text) => link.sent.push(JSON.parse(text)), close: () => void (link.closed = true) }
  }
  const applied: { events: number[]; reset: boolean; at: number }[] = []
  const statuses: FeedStatus[] = []
  const pending: string[][] = []
  const frames: (() => void)[] = []
  const feed = openFeed(
    transport,
    {
      apply: (events, reset, at) => applied.push({ events: events.map((e) => e.seq), reset, at }),
      status: (s) => statuses.push(s),
      pending: (actions) => pending.push(actions.map((a) => a.id)),
    },
    (flush) => frames.push(flush),
  )
  const say = (m: ServerMessage) => links.at(-1)!.on.message(JSON.stringify(m))
  const nextFrame = () => frames.splice(0).forEach((f) => f())
  return { links, applied, statuses, pending, feed, close: feed.close, say, nextFrame, last: () => links.at(-1)! }
}

const ack = { id: 'screen-1', alert: 'temp-4A09-740', act: 'ack', by: 'screen' } as const
const logged = (seq: number): Stamped => ({ seq, at: seq, kind: 'alert-action', action: ack })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('the live feed connection', () => {
  it('subscribes fresh, then asks only for what it missed after a drop', () => {
    const h = harness()
    h.last().on.open()
    expect(h.last().sent).toEqual([{ type: 'subscribe' }])

    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0), ev(1), ev(2)], at: 870 })
    h.say({ type: 'event', day: 1, event: ev(3, 871) })
    h.nextFrame()
    expect(h.applied).toEqual([{ events: [0, 1, 2, 3], reset: true, at: 870 }])

    h.last().on.close()
    expect(h.statuses.at(-1)).toMatchObject({ state: 'retrying', attempt: 1 })
    vi.advanceTimersByTime(RETRY.base)
    expect(h.links).toHaveLength(2)
    h.last().on.open()
    expect(h.last().sent).toEqual([{ type: 'subscribe', day: 1, after: 3 }])

    h.say({ type: 'sync', day: 1, reset: false, events: [ev(4), ev(5)], at: 880 })
    h.nextFrame()
    expect(h.applied.at(-1)).toEqual({ events: [4, 5], reset: false, at: 880 })
    expect(h.statuses.at(-1)).toEqual({ state: 'live', caughtUp: 2 })
  })

  it('batches a burst into one update per frame', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [], at: 0 })
    for (let i = 0; i < 5; i++) h.say({ type: 'event', day: 1, event: ev(i) })
    h.say({ type: 'tick', day: 1, at: 1, seq: 4 })
    h.nextFrame()
    expect(h.applied).toEqual([{ events: [0, 1, 2, 3, 4], reset: true, at: 1 }])
  })

  it('asks again when a sequence number is skipped, and ignores the stream until answered', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0)], at: 0 })
    h.say({ type: 'event', day: 1, event: ev(2) })
    h.say({ type: 'event', day: 1, event: ev(3) })
    expect(h.last().sent).toEqual([{ type: 'subscribe' }, { type: 'subscribe', day: 1, after: 0 }])
    h.nextFrame()
    expect(h.applied.flatMap((a) => a.events)).toEqual([0])
  })

  it('treats a tick ahead of its events as a gap, and a new day as a restart', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0)], at: 0 })
    h.say({ type: 'tick', day: 1, at: 1, seq: 1 })
    expect(h.last().sent.at(-1)).toEqual({ type: 'subscribe', day: 1, after: 0 })
    h.say({ type: 'sync', day: 2, reset: true, events: [ev(0, 0)], at: 0 })
    h.nextFrame()
    expect(h.applied.at(-1)).toMatchObject({ events: [0], reset: true })
  })

  it('drops a connection that goes quiet', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [], at: 0 })
    vi.advanceTimersByTime(SILENCE - 1)
    expect(h.last().closed).toBe(false)
    vi.advanceTimersByTime(1)
    expect(h.last().closed).toBe(true)
    expect(h.statuses.at(-1)).toMatchObject({ state: 'retrying' })
  })

  it('drops a connection that sends something other than JSON', () => {
    const h = harness()
    h.last().on.open()
    h.last().on.message('<html>')
    expect(h.last().closed).toBe(true)
  })

  it('backs off exponentially to a cap, with jitter, and starts over once back', () => {
    for (let n = 0; n < 8; n++) {
      const d = Math.min(RETRY.cap, RETRY.base * 2 ** n)
      expect(backoff(n, () => 0)).toBe(d / 2)
      expect(backoff(n, () => 1)).toBe(d)
    }
    const h = harness()
    for (let i = 0; i < 3; i++) {
      h.last().on.close()
      vi.advanceTimersByTime(RETRY.base * 2 ** i)
    }
    expect(h.statuses.filter((s) => s.state === 'retrying').map((s) => s.attempt)).toEqual([1, 2, 3])
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [], at: 0 })
    h.last().on.close()
    expect(h.statuses.at(-1)).toMatchObject({ state: 'retrying', attempt: 1 })
  })

  it('sends an action at once, and keeps it until the log has it', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0)], at: 870 })
    h.feed.act(ack)
    expect(h.last().sent.at(-1)).toEqual({ type: 'act', day: 1, action: ack })
    expect(h.pending.at(-1)).toEqual(['screen-1'])
    h.say({ type: 'event', day: 1, event: logged(1) })
    expect(h.pending.at(-1)).toEqual([])
  })

  it('holds an action taken while the feed is down, and sends it once the feed is back', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0)], at: 870 })
    h.last().on.close()
    h.feed.act(ack)
    expect(h.pending.at(-1)).toEqual(['screen-1'])
    vi.advanceTimersByTime(RETRY.base)
    h.last().on.open()
    expect(h.last().sent).toEqual([{ type: 'subscribe', day: 1, after: 0 }])
    h.say({ type: 'sync', day: 1, reset: false, events: [], at: 875 })
    expect(h.last().sent.at(-1)).toEqual({ type: 'act', day: 1, action: ack })
  })

  it('sends again after a reconnect what the log may have missed, but not what it caught up with', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0)], at: 870 })
    h.feed.act(ack)
    h.last().on.close()
    vi.advanceTimersByTime(RETRY.base)
    h.last().on.open()
    // The server logged it before the line dropped: the catch-up carries it, and nothing is sent twice.
    h.say({ type: 'sync', day: 1, reset: false, events: [logged(1)], at: 875 })
    expect(h.last().sent.filter((m) => m.type === 'act')).toEqual([])
    expect(h.pending.at(-1)).toEqual([])
  })

  it('drops the actions of a day that has ended', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [], at: 1439 })
    h.last().on.close()
    h.feed.act(ack)
    vi.advanceTimersByTime(RETRY.base)
    h.last().on.open()
    h.say({ type: 'sync', day: 2, reset: true, events: [], at: 0 })
    expect(h.pending.at(-1)).toEqual([])
    expect(h.last().sent.filter((m) => m.type === 'act')).toEqual([])
  })

  it('stays closed once closed', () => {
    const h = harness()
    h.last().on.open()
    h.say({ type: 'sync', day: 1, reset: true, events: [ev(0)], at: 0 })
    h.close()
    h.nextFrame()
    vi.advanceTimersByTime(60_000)
    expect(h.links).toHaveLength(1)
    expect(h.last().closed).toBe(true)
    expect(h.applied).toEqual([])
    expect(h.statuses.at(-1)).toEqual({ state: 'closed' })
  })
})
