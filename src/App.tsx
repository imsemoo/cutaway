import { Component, Suspense, lazy, useEffect, type ReactNode } from 'react'
import type { Day } from './data/types'
import { ROOM_BY_ID } from './data/floorplan'
import { ASSET_LABEL, BED_LABEL, bedAt } from './lib/query'
import { syncUrl, useWard } from './state/store'
import { LayerDock, ViewTools } from './ui/LayerDock'
import { ListView } from './ui/ListView'
import { Panel } from './ui/Panel'
import { Tags } from './ui/Tags'
import { Timeline } from './ui/Timeline'
import { TopBar } from './ui/TopBar'

// The 3D bundle loads after the interface shell has painted.
const Scene = lazy(() => import('./scene/Scene'))

export default function App() {
  const day = useWard((s) => s.day)
  const view = useWard((s) => s.view)
  useSimulation()
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
            <Scene />
          </Suspense>
        </WebGLBoundary>
        <Tags />
        <LayerDock />
        <ViewTools />
        {view === 'list' && <ListView />}
        {!day && (
          <div className="loading" role="status">
            Building the simulated day…
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
    worker.onmessage = (e: MessageEvent<{ day: Day; ms: number }>) => {
      setDay(e.data.day, e.data.ms)
      worker.terminate()
    }
    worker.postMessage({ seed: 20260928 })
    return () => worker.terminate()
  }, [setDay])
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
      } else if (e.key === ' ' && !el.closest('button, a, [role="radio"]')) {
        e.preventDefault()
        s.setPlaying(!s.playing)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
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
