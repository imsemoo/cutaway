import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORY, WING_BY_CODE } from '../data/floorplan'
import { clock } from '../lib/query'
import { setLang } from '../i18n'
import { SEED, simulate } from '../sim/simulate'
import { useWard } from '../state/store'
import { bridge } from './bridge'
import { PROTOCOL, type TwinAlert, type TwinState } from './protocol'

const HOST = 'https://ops.example.org'
const day = simulate(SEED, [WING_BY_CODE[STORY]])
const initial = useWard.getState()

interface Posted {
  data: { type: string; state?: TwinState; alerts?: TwinAlert[]; alert?: TwinAlert; key?: string; message?: string }
  origin: string
}

/** The twin in a frame: what it posts to the page around it, and a way to send it messages as that page. */
function framed() {
  const posted: Posted[] = []
  const parent = { postMessage: (data: Posted['data'], origin: string) => posted.push({ data, origin }) }
  const win = Object.assign(new EventTarget(), {
    parent,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  })
  vi.stubGlobal('window', win)
  const stop = bridge()
  const send = (data: object, from: { origin?: string; source?: unknown } = {}) =>
    win.dispatchEvent(Object.assign(new Event('message'), { data: { protocol: PROTOCOL, ...data }, origin: from.origin ?? HOST, source: from.source ?? parent }))
  const of = (type: string) => posted.filter((p) => p.data.type === type)
  return { posted, send, of, stop }
}

let twin: ReturnType<typeof framed>

beforeEach(() => {
  useWard.setState(initial, true)
  useWard.getState().setDay(day, 0, false)
})

afterEach(async () => {
  twin?.stop()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  await setLang('en')
})

describe('the embed bridge', () => {
  it('announces itself to any page, and tells nothing until one connects', () => {
    twin = framed()
    expect(twin.posted).toEqual([{ data: { protocol: PROTOCOL, type: 'ready' }, origin: '*' }])
    useWard.getState().setLayer('temp')
    expect(twin.posted).toHaveLength(1)
  })

  it('answers the page that connects, and takes commands from no one else', () => {
    twin = framed()
    twin.send({ type: 'connect' })
    const [state] = twin.of('state')
    expect(state.origin).toBe(HOST)
    expect(state.data.state).toMatchObject({ at: STORY.toLowerCase(), select: null, layer: 'beds', mode: 'replay' })
    expect(twin.of('alerts')).toHaveLength(1)

    twin.send({ type: 'set', layer: 'air' }, { origin: 'https://elsewhere.example' })
    twin.send({ type: 'set', layer: 'air' }, { source: {} })
    twin.send({ type: 'set', layer: 'air', protocol: 'other/1' })
    expect(useWard.getState().layer).toBe('beds')

    twin.send({ type: 'set', layer: 'air' })
    expect(useWard.getState().layer).toBe('air')
    // Once connected, the twin stays with that page.
    twin.send({ type: 'connect' }, { origin: 'https://elsewhere.example' })
    twin.send({ type: 'set', layer: 'temp' }, { origin: 'https://elsewhere.example' })
    expect(useWard.getState().layer).toBe('air')
    expect(twin.posted.every((p) => p.origin === HOST || p.data.type === 'ready')).toBe(true)
  })

  it('sets what a link sets, and says what it could not', () => {
    twin = framed()
    twin.send({ type: 'connect' })
    twin.send({ type: 'set', select: '4a09', layer: 'temp', t: '15:30' })
    const s = useWard.getState()
    expect(s.selection).toEqual({ type: 'room', id: '4A09' })
    expect(s.scope).toBe('4A')
    expect(s.t).toBe(15 * 60 + 30)
    expect(twin.of('state').at(-1)?.data.state).toMatchObject({ select: '4A09', layer: 'temp', t: '15:30' })

    twin.send({ type: 'set', layer: 'heat', room: '4A09', select: 'nowhere' })
    expect(twin.of('error').map((p) => p.data.key).sort()).toEqual(['layer', 'room', 'select'])
    expect(useWard.getState().selection).toEqual({ type: 'room', id: '4A09' })

    twin.send({ type: 'set', select: null, at: 'level-2' })
    expect(useWard.getState()).toMatchObject({ selection: null, scope: 'L2' })

    twin.send({ type: 'set', mode: 'live', t: '10:00' })
    expect(useWard.getState().mode).toBe('live')
    expect(twin.of('error').at(-1)?.data).toMatchObject({ key: 't', message: 'Live time follows the feed.' })
  })

  it('tells the page when an alert opens as the day plays, not when the clock jumps', () => {
    const [first, later] = day.alerts.filter((a) => a.from > 8 * 60)
    useWard.setState({ t: first.from - 2, playing: true })
    twin = framed()
    twin.send({ type: 'connect' })
    useWard.getState().setT(first.from)
    const heard = twin.of('alert').find((p) => p.data.alert?.id === first.id)?.data.alert
    expect(heard?.opened).toBe(clock(first.from))

    const opened = twin.of('alert').length
    useWard.getState().setT(later.from + 120)
    useWard.getState().setT(first.from - 60)
    useWard.getState().setPlaying(false)
    useWard.getState().setT(first.from)
    expect(twin.of('alert')).toHaveLength(opened)
  })

  it('words the alerts in the language on show', async () => {
    const alert = day.alerts.find((a) => a.kind === 'call')!
    useWard.setState({ t: alert.from + 1 })
    twin = framed()
    twin.send({ type: 'connect' })
    const english = twin.of('alerts').at(-1)?.data.alerts?.find((a) => a.id === alert.id)
    expect(english).toMatchObject({ kind: 'call', title: 'Call light unanswered', wing: STORY })

    twin.send({ type: 'set', lang: 'ar' })
    await vi.waitFor(() => expect(twin.of('state').at(-1)?.data.state?.lang).toBe('ar'))
    const arabic = twin.of('alerts').at(-1)?.data.alerts?.find((a) => a.id === alert.id)
    expect(arabic?.title).not.toBe(english?.title)
    expect(arabic?.target).toEqual(english?.target)
  })

  it('reports the clock alone at most once a second', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    twin = framed()
    twin.send({ type: 'connect' })
    const before = twin.of('state').length
    for (const t of [600, 601, 602, 603]) useWard.getState().setT(t)
    expect(twin.of('state')).toHaveLength(before)
    vi.advanceTimersByTime(1000)
    expect(twin.of('state').map((p) => p.data.state?.t).slice(before)).toEqual(['10:03'])

    useWard.getState().setLayer('calls')
    expect(twin.of('state').at(-1)?.data.state?.layer).toBe('calls')
    // A time the host sets is reported at once.
    twin.send({ type: 'set', t: '11:00' })
    expect(twin.of('state').at(-1)?.data.state?.t).toBe('11:00')
  })
})
