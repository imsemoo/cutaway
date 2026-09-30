import type { Alert, Day } from '../data/types'
import { setLang, useLang } from '../i18n'
import { alertTitle, describe, severityAt } from '../lib/alerts'
import { alertWing, clock } from '../lib/query'
import { alertPlace, alertWatch } from '../lib/watch'
import { scopeToParam } from '../state/scope'
import { readParams, useWard } from '../state/store'
import { PROTOCOL, type Envelope, type HostMessage, type Settings, type TwinAlert, type TwinMessage, type TwinState } from './protocol'

/*
  The twin's side of the embed protocol (protocol.ts). It loads only when the
  page runs in a frame. A deployment can name the pages allowed to drive it
  at build time, VITE_EMBED_ORIGINS=https://ops.example.org; the demo takes any.
*/
const ALLOWED = (import.meta.env.VITE_EMBED_ORIGINS ?? '')
  .split(',')
  .map((o: string) => o.trim())
  .filter(Boolean)

const SETTINGS = new Set(['at', 'select', 'view', 'layer', 't', 'mode', 'lang', 'playing'])

export function bridge() {
  const parent = window.parent
  let host: string | null = null
  const post = (m: TwinMessage) => host && parent.postMessage({ protocol: PROTOCOL, ...m } satisfies Envelope<TwinMessage>, host)
  const refuse = (key: string, message: string) => post({ type: 'error', key, message })

  function apply(m: Settings) {
    for (const key of Object.keys(m)) if (key !== 'type' && key !== 'protocol' && !SETTINGS.has(key)) refuse(key, `There is no setting called ${key}.`)
    const { params, bad } = readParams(m as Record<string, unknown>)
    for (const key of bad) refuse(key, `${JSON.stringify(m[key as keyof Settings])} is not a valid ${key}.`)
    const s = useWard.getState()
    if (params.mode) s.setMode(params.mode)
    if (params.view) s.setView(params.view)
    if (params.layer) s.setLayer(params.layer)
    if (params.scope) s.setScope(params.scope)
    if (params.selection !== undefined) s.select(params.selection)
    const live = useWard.getState().mode === 'live'
    if (params.t !== undefined) {
      if (live) refuse('t', 'Live time follows the feed.')
      else s.setT(params.t)
    }
    if (m.playing !== undefined) {
      if (typeof m.playing !== 'boolean') refuse('playing', `${JSON.stringify(m.playing)} is not true or false.`)
      else if (live) refuse('playing', 'Live mode is always playing.')
      else s.setPlaying(m.playing)
    }
    if (m.lang !== undefined) {
      if (m.lang === 'en' || m.lang === 'ar') void setLang(m.lang)
      else refuse('lang', `${JSON.stringify(m.lang)} is not a valid lang.`)
    }
  }

  // Where the twin stands. The clock alone is reported at most once a second, so playing does not
  // flood the host, unless the host moved it.
  let sent: TwinState | null = null
  let sentAt = 0
  let timer = 0
  function sendState(now = false) {
    const s = useWard.getState()
    const state: TwinState = {
      at: scopeToParam(s.scope),
      select: s.selection?.id ?? null,
      view: s.view,
      layer: s.layer,
      t: clock(s.t),
      mode: s.mode,
      lang: useLang.getState().lang,
      playing: s.playing,
    }
    const json = JSON.stringify(state)
    if (sent && JSON.stringify(sent) === json) return
    const clockOnly = sent !== null && JSON.stringify({ ...sent, t: state.t }) === json
    const wait = clockOnly && !now ? sentAt + 1000 - performance.now() : 0
    if (wait > 0) {
      timer = window.setTimeout(sendState, wait)
      return
    }
    sent = state
    sentAt = performance.now()
    post({ type: 'state', state })
  }

  // The alerts open at the twin's minute, and the ones seen opening while the clock ran forward.
  let listed = ''
  let watch = alertWatch()
  function sendAlerts() {
    const s = useWard.getState()
    const { day, t } = s
    const { open: now, opened } = watch(s)
    if (day) for (const a of opened) post({ type: 'alert', alert: describeAlert(a, day, t) })
    const key = useLang.getState().lang + now.map((a) => a.id + (day ? severityAt(a, day, t) : '')).join()
    if (key === listed) return
    listed = key
    post({ type: 'alerts', alerts: day ? now.map((a) => describeAlert(a, day, t)) : [] })
  }

  // A host's command is applied whole, then reported once.
  let applying = false
  const onChange = () => {
    if (!host || applying) return
    window.clearTimeout(timer)
    sendState()
    sendAlerts()
  }

  const onMessage = (e: MessageEvent<unknown>) => {
    const m = e.data as Partial<Envelope<HostMessage>> | null
    if (e.source !== parent || typeof m !== 'object' || m?.protocol !== PROTOCOL) return
    if (ALLOWED.length > 0 && !ALLOWED.includes(e.origin)) return
    if (m.type === 'connect') {
      // An opaque origin, such as a page opened from a file, cannot be answered without answering everyone.
      if (e.origin === 'null') return
      host = e.origin
      sent = null
      listed = ''
      watch = alertWatch()
      onChange()
    } else if (m.type === 'set' && e.origin === host) {
      applying = true
      apply(m)
      applying = false
      window.clearTimeout(timer)
      sendState(true)
      sendAlerts()
    }
  }

  window.addEventListener('message', onMessage)
  const stopWard = useWard.subscribe(onChange)
  const stopLang = useLang.subscribe(onChange)
  parent.postMessage({ protocol: PROTOCOL, type: 'ready' } satisfies Envelope<TwinMessage>, '*')
  return () => {
    window.removeEventListener('message', onMessage)
    window.clearTimeout(timer)
    stopWard()
    stopLang()
  }
}

function describeAlert(a: Alert, day: Day, t: number): TwinAlert {
  return {
    id: a.id,
    kind: a.kind,
    severity: severityAt(a, day, t),
    title: alertTitle(a),
    text: describe(a, day, t),
    target: a.target,
    where: alertPlace(a, day),
    wing: alertWing(a) ?? '',
    since: clock(a.since),
  }
}
