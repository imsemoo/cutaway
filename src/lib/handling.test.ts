import { beforeEach, describe, expect, it } from 'vitest'
import { STORY, WING_BY_CODE } from '../data/floorplan'
import type { AlertAction } from '../data/types'
import { SEED, simulate } from '../sim/simulate'
import { act } from '../state/act'
import { DEFAULT_TIME, useWard } from '../state/store'
import { OWNER, alertLog, handlingAt } from './handling'
import { activeAlerts } from './query'

const recorded = simulate(SEED, [WING_BY_CODE[STORY]])
const initial = useWard.getState()
// The warm room at 14:30: open from 12:20 until the fault is fixed.
const warm = activeAlerts(recorded, DEFAULT_TIME).find((a) => a.kind === 'temp')!
const action = (at: number, act: AlertAction['act'], id = `a${at}${act}`): AlertAction => ({ id, alert: warm.id, act, at, ...(act === 'send' && { team: OWNER[warm.kind] }) })

beforeEach(() => {
  useWard.setState(initial, true)
  useWard.getState().setDay(recorded, 0, false)
})

describe('handling an alert', () => {
  it('knows nothing done after the minute it is asked about', () => {
    const day = { ...recorded, actions: [action(DEFAULT_TIME, 'ack'), action(DEFAULT_TIME + 2, 'send')] }
    expect(handlingAt(day, warm.id, DEFAULT_TIME - 1)).toEqual({})
    expect(handlingAt(day, warm.id, DEFAULT_TIME)).toEqual({ ack: day.actions[0] })
    expect(handlingAt(day, warm.id, DEFAULT_TIME + 2)).toEqual({ ack: day.actions[0], sent: day.actions[1] })
  })

  it('takes the first acknowledgement, and a send as one', () => {
    const day = { ...recorded, actions: [action(DEFAULT_TIME + 5, 'ack'), action(DEFAULT_TIME, 'send'), action(DEFAULT_TIME + 1, 'ack')] }
    const { ack, sent } = handlingAt(day, warm.id, DEFAULT_TIME + 10)
    expect(ack).toBe(sent)
    expect(sent?.at).toBe(DEFAULT_TIME)
    expect(alertLog(day, warm, DEFAULT_TIME + 10).map((s) => s.what)).toEqual(['opened', 'sent'])
  })

  it('reads its log in order, and clears only once the room has cooled', () => {
    const day = { ...recorded, actions: [action(DEFAULT_TIME, 'ack'), action(DEFAULT_TIME + 3, 'send')] }
    expect(alertLog(day, warm, DEFAULT_TIME + 3)).toEqual([
      { at: warm.from, what: 'opened' },
      { at: DEFAULT_TIME, what: 'acknowledged', by: undefined },
      { at: DEFAULT_TIME + 3, what: 'sent', by: undefined, team: 'facilities' },
    ])
    expect(alertLog(day, warm, warm.to).at(-1)).toEqual({ at: warm.to, what: 'cleared' })
  })

  it('sends every kind of alert to a team', () => {
    for (const a of recorded.alerts) expect(OWNER[a.kind], a.kind).toBeDefined()
  })
})

describe('acting in replay', () => {
  it('joins the day at the minute on show, and goes when the clock is scrubbed back before it', () => {
    const s = useWard.getState()
    s.setT(DEFAULT_TIME)
    act(warm.id, 'ack')
    const day = useWard.getState().day!
    expect(day.actions).toMatchObject([{ alert: warm.id, act: 'ack', at: DEFAULT_TIME }])
    expect(day.actions[0].by).toBeUndefined()
    expect(useWard.getState().recorded).toBe(day)
    expect(handlingAt(day, warm.id, DEFAULT_TIME - 5).ack).toBeUndefined()
  })

  it('carries over when the rest of the hospital arrives', () => {
    act(warm.id, 'ack')
    useWard.getState().setDay(simulate(SEED), 0, true)
    expect(useWard.getState().day?.actions).toHaveLength(1)
  })

  it('goes to the live feed in live mode, under this screen', () => {
    const sent: unknown[] = []
    useWard.getState().setMode('live')
    useWard.setState({ send: (a) => sent.push(a) })
    act(warm.id, 'send', 'facilities')
    expect(sent).toEqual([{ id: expect.any(String), alert: warm.id, act: 'send', team: 'facilities', by: useWard.getState().screen }])
    expect(useWard.getState().recorded?.actions).toEqual([])
  })
})
