import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react'
import type { Day } from './data/types'
import { ROOM_BY_ID } from './data/floorplan'
import { ASSET_LABEL, BED_LABEL, bedAt, clock } from './lib/query'
import { openFeed, webSocketTransport } from './live/feed'
import { mockTransport } from './live/mock'
import { SEED } from './sim/simulate'
import { STEP } from './sim/time'
import { useQuality } from './state/quality'
import { covers, syncUrl, useWard } from './state/store'
import { Building } from './ui/Building'
import { LayerDock, ViewTools } from './ui/LayerDock'
import { ListView } from './ui/ListView'
import { Panel } from './ui/Panel'
import { Tags } from './ui/Tags'
import { Timeline } from './ui/Timeline'
import { TopBar } from './ui/TopBar'

// The 3D bundle loads after the interface shell has painted.
const Scene = lazy(() => import('./scene/Scene'))

export default function App() {
  // Only whether the day covers what is on show: in live mode the day changes every second, and the whole tree need not follow.
  const ready = useWard(covers)
  const view = useWard((s) => s.view)
  const live = useWard((s) => s.mode === 'live')
  const lost = useQuality((s) => s.lost)
  const epoch = useQuality((s) => s.epoch)
  const rebuild = useQuality((s) => s.rebuild)
  useSimulation()
  useLiveFeed()
  usePlayback()
  useKeys()
  useEffect(syncUrl, [])

  return (
    <div className="app" data-view={view}>
      <a className="skip" href="#details">Skip to details</a>
      <TopBar />
      <main className="stage" aria-label="Floor model">
        <WebGLBoundary>
          <Suspense fallback={null}>
            <Scene key={epoch} />
          </Suspense>
        </WebGLBoundary>
        <Tags />
        <Building />
        <LayerDock />
        <ViewTools />
        {view === 'list' && <ListView />}
        {!ready && (
          <div className="loading" role="status">
            {live ? 'Connecting to the live feed…' : 'Building the simulated day…'}
          </div>
        )}
        <Stale />
        {lost && (
          <div className="paused" role="status">
            <p>The 3D view paused: the graphics driver reset. It restarts on its own when the browser allows.</p>
            <button className="btn" onClick={rebuild}>
              Restart the 3D view
            </button>
          </div>
        )}
      </main>
      <Timeline />
      <div id="details" className="panel-wrap">
        <Panel />
      </div>
      <Announcer />
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

/** In live mode, opens the feed and folds what it sends into the day the views read. */
function useLiveFeed() {
  const live = useWard((s) => s.mode === 'live')
  useEffect(() => {
    if (!live) return
    const { applyFeed, setFeed, replayT } = useWard.getState()
    const url = import.meta.env.VITE_FEED_URL as string | undefined
    // The mock server starts its clock where the replay stood, on the five-minute grid.
    const transport = url ? webSocketTransport(url) : mockTransport(Math.floor(replayT / STEP) * STEP)
    return openFeed(transport, { apply: applyFeed, status: setFeed })
  }, [live])
}

/** Advances the clock while playing, about twelve updates a second. */
function usePlayback() {
  const playing = useWard((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
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
      No connection. Showing the floor as of <span className="num">{clock(t)}</span>
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
    text = `${r.name} selected${b ? `, ${BED_LABEL[b.state].toLowerCase()}` : ''}.`
  } else if (day && selection?.type === 'asset') {
    const a = day.assets.find((x) => x.id === selection.id)
    if (a) text = `${ASSET_LABEL[a.kind]} ${a.id} selected.`
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
      return <p className="nogl">The 3D model needs WebGL, which is turned off or unavailable in this browser. The list view shows the same floor.</p>
    }
    return this.props.children
  }
}
