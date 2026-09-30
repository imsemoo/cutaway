import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react'
import type { Day } from './data/types'
import { ROOM_BY_ID } from './data/floorplan'
import { say, useLang } from './i18n'
import { assetLabel, bedAt, bedLabel, clock, roomName } from './lib/query'
import { SEED } from './sim/simulate'
import { useQuality } from './state/quality'
import { covers, syncUrl, useWard } from './state/store'
import { Building } from './ui/Building'
import { LayerDock, ViewTools } from './ui/LayerDock'
import { Panel } from './ui/Panel'
import { Tags } from './ui/Tags'
import { Timeline } from './ui/Timeline'
import { TopBar } from './ui/TopBar'

// The 3D bundle loads after the interface shell has painted; the table, only when someone opens the list view.
const Scene = lazy(() => import('./scene/Scene'))
const ListView = lazy(() => import('./ui/ListView'))
// Alerts are spoken once the day runs, never before the first paint.
const AlertAnnouncer = lazy(() => import('./ui/AlertAnnouncer'))

export default function App() {
  // Only whether the day covers what is on show: in live mode the day changes every second, and the whole tree need not follow.
  const ready = useWard(covers)
  const view = useWard((s) => s.view)
  const live = useWard((s) => s.mode === 'live')
  const lost = useQuality((s) => s.lost)
  const epoch = useQuality((s) => s.epoch)
  const rebuild = useQuality((s) => s.rebuild)
  // A new language redraws every word; the timeline, which remembers its marks, starts over.
  const lang = useLang((s) => s.lang)
  useSimulation()
  useLiveFeed()
  useEmbed()
  usePlayback()
  useKeys()
  useEffect(syncUrl, [])

  return (
    <div className="app" data-view={view}>
      <a className="skip" href="#details">
        {say('Skip to details')}
      </a>
      <TopBar />
      <main className="stage" aria-label={say('Floor model')}>
        <WebGLBoundary>
          <Suspense fallback={null}>
            <Scene key={epoch} />
          </Suspense>
        </WebGLBoundary>
        <Tags />
        <Building />
        <LayerDock />
        <ViewTools />
        {view === 'list' && (
          <Suspense fallback={null}>
            <ListView />
          </Suspense>
        )}
        {!ready && (
          <div className="loading" role="status">
            {live ? say('Connecting to the live feed…') : say('Building the simulated day…')}
          </div>
        )}
        <Stale />
        {lost && (
          <div className="paused" role="status">
            <p>{say('The 3D view paused: the graphics driver reset. It restarts on its own when the browser allows.')}</p>
            <button className="btn" onClick={rebuild}>
              {say('Restart the 3D view')}
            </button>
          </div>
        )}
      </main>
      <Timeline key={lang} />
      <div id="details" className="panel-wrap">
        <Panel />
      </div>
      <Announcer />
      <Suspense fallback={null}>
        <AlertAnnouncer />
      </Suspense>
    </div>
  )
}

function useSimulation() {
  const setDay = useWard((s) => s.setDay)
  useEffect(() => {
    const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ day: Day; ms: number; complete: boolean }>) => {
      setDay(e.data.day, e.data.ms, e.data.complete)
      if (e.data.complete) worker.terminate()
    }
    // The wing on show first, then the rest of the hospital.
    const { scope } = useWard.getState()
    worker.postMessage({ seed: SEED, first: scope === 'all' ? undefined : scope })
    return () => worker.terminate()
  }, [setDay])
}

/** In live mode, opens the feed. Its code loads the first time live mode is turned on. */
function useLiveFeed() {
  const live = useWard((s) => s.mode === 'live')
  useEffect(() => {
    if (!live) return
    let close: (() => void) | undefined
    let left = false
    void import('./live/connect').then(({ connect }) => {
      if (!left) close = connect()
    })
    return () => {
      left = true
      close?.()
    }
  }, [live])
}

/** In a frame, speaks the embed protocol with the page around it. Its code loads only there. */
function useEmbed() {
  useEffect(() => {
    if (window.parent === window) return
    let stop: (() => void) | undefined
    let left = false
    void import('./embed/bridge').then(({ bridge }) => {
      if (!left) stop = bridge()
    })
    return () => {
      left = true
      stop?.()
    }
  }, [])
}

/** Advances the clock while playing, about twelve updates a second. */
function usePlayback() {
  const playing = useWard((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    // Measured from the first frame's own timestamp: a frame's clock need not be performance.now()'s,
    // and under the film's fake clock the two differed by hours, so the first step jumped the day ahead.
    let last = -1
    const loop = (now: number) => {
      if (last < 0) last = now
      const elapsed = now - last
      if (elapsed >= 80) {
        last = now
        const { t, speed, setT, setPlaying } = useWard.getState()
        const next = t + (elapsed / 1000) * speed
        if (next >= 1439) {
          setT(1439)
          setPlaying(false)
          return
        }
        setT(next)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.closest('input, textarea, select, [contenteditable="true"]') && !(el as HTMLInputElement).type?.includes('range')
      if (typing) return
      const s = useWard.getState()
      if (e.key === '/') {
        e.preventDefault()
        document.getElementById('search')?.focus()
      } else if (e.key === 'Escape' && s.selection) {
        s.select(null)
      } else if (e.key === ' ' && s.mode === 'replay' && !el.closest('button, a, [role="radio"]')) {
        e.preventDefault()
        s.setPlaying(!s.playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Live data that has stopped arriving must not pass for live, so the stage says so. The feed status announces it. */
function Stale() {
  const offline = useWard((s) => s.mode === 'live' && s.day !== null && s.feed.state !== 'live')
  const t = useWard((s) => s.t)
  if (!offline) return null
  return (
    <p className="stale" aria-hidden="true">
      {say('No connection. Showing the floor as of')} <span className="num">{clock(t)}</span>
    </p>
  )
}

/** Tells screen readers what the 3D view just focused on. */
function Announcer() {
  const selection = useWard((s) => s.selection)
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  let text = ''
  if (day && selection?.type === 'room') {
    const r = ROOM_BY_ID[selection.id]
    const b = bedAt(day, r.id, t)
    text = say(b ? '{name} selected, {state}.' : '{name} selected.', { name: roomName(r.id), state: b ? bedLabel(b.state).toLowerCase() : '' })
  } else if (day && selection?.type === 'asset') {
    const a = day.assets.find((x) => x.id === selection.id)
    if (a) text = say('{kind} {id} selected.', { kind: assetLabel(a.kind), id: a.id })
  }
  return (
    <p className="sr-only" aria-live="polite">
      {text}
    </p>
  )
}

class WebGLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    useWard.getState().setView('list')
  }
  render() {
    if (this.state.failed) {
      return <p className="nogl">{say('The 3D model needs WebGL, which is turned off or unavailable in this browser. The list view shows the same floor.')}</p>
    }
    return this.props.children
  }
}
