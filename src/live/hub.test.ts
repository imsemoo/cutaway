import { describe, expect, it } from 'vitest'
import { createHub, type Timed } from './hub'
import type { ServerMessage } from './protocol'

const call = (at: number): Timed => ({ kind: 'call', room: '4A01', pressed: at, on: true, at })
const opens = (at: number): Timed => ({ kind: 'alert-open', alert: { id: 'temp-4A09-730', kind: 'temp', from: at, since: at, severity: 'warning', target: { type: 'room', id: '4A09' }, title: 'Room too warm' }, at })

function hub() {
  const heard: { conn: number; m: ServerMessage }[] = []
  return { h: createHub((conn, m) => heard.push({ conn, m })), heard, last: (conn: number) => heard.filter((x) => x.conn === conn).at(-1)?.m }
}

describe('the feed hub', () => {
  it('gives a new screen the day so far, and holds back what the clock has not reached', () => {
    const { h, last } = hub()
    h.newDay([call(10), call(20), call(30)], 20)
    h.subscribe(1, { type: 'subscribe' }, 20)
    expect(last(1)).toMatchObject({ type: 'sync', reset: true, events: [{ seq: 0 }, { seq: 1 }] })
    h.tick(30)
    expect(last(1)).toMatchObject({ type: 'tick', at: 30, seq: 2 })
  })

  it('gives a returning screen only what it missed', () => {
    const { h, last } = hub()
    h.newDay([call(10), call(20), call(30)], 30)
    h.subscribe(1, { type: 'subscribe', day: h.day, after: 0 }, 30)
    expect(last(1)).toMatchObject({ type: 'sync', reset: false, events: [{ seq: 1 }, { seq: 2 }] })
    h.subscribe(2, { type: 'subscribe', day: h.day + 1, after: 0 }, 30)
    expect(last(2)).toMatchObject({ type: 'sync', reset: true })
  })

  it('appends what happens now after what is due, in order, and numbers it', () => {
    const { h, last } = hub()
    h.newDay([call(10), call(40)], 20)
    h.subscribe(1, { type: 'subscribe' }, 20)
    h.append([call(25)], 25)
    expect(last(1)).toMatchObject({ type: 'event', event: { seq: 1, at: 25 } })
    h.tick(40)
    expect(last(1)).toMatchObject({ type: 'tick', seq: 2 })
  })

  it('logs an action once, and only about an alert that has opened', () => {
    const { h } = hub()
    h.newDay([opens(730)], 700)
    const action = { id: 'screen-1', alert: 'temp-4A09-730', act: 'ack' } as const
    expect(h.act({ type: 'act', day: h.day, action }, 720)).toBeUndefined()
    expect(h.act({ type: 'act', day: h.day, action }, 735)).toMatchObject({ kind: 'alert-action', at: 735, seq: 1 })
    expect(h.act({ type: 'act', day: h.day, action }, 736)).toBeUndefined()
    expect(h.act({ type: 'act', day: h.day - 1, action: { ...action, id: 'screen-2' } }, 736)).toBeUndefined()
  })

  it('starts every screen over on a new day', () => {
    const { h, last } = hub()
    h.newDay([call(10)], 10)
    h.subscribe(1, { type: 'subscribe' }, 10)
    h.newDay([], 0)
    expect(last(1)).toEqual({ type: 'sync', day: 2, reset: true, events: [], at: 0 })
  })
})
