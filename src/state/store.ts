import { create } from 'zustand'
import { ROOM_BY_ID } from '../data/floorplan'
import type { Day, Layer, Selection, View } from '../data/types'
import { applyEvents, emptyDay } from '../live/events'
import type { FeedStatus } from '../live/feed'
import type { Stamped } from '../live/protocol'
import { SEED } from '../sim/simulate'

export const DEFAULT_TIME = 14 * 60 + 30
export const SPEEDS = [5, 15, 60] as const

/** Replay plays the recorded day; live builds the day from the feed as it arrives. */
export type Mode = 'replay' | 'live'

interface WardState {
  /** The day the views read: the recorded one in replay, the one the feed builds in live. */
  day: Day | null
  recorded: Day | null
  simMs: number
  t: number
  /** Where the replay stood when live took over, to return to. */
  replayT: number
  mode: Mode
  feed: FeedStatus
  playing: boolean
  speed: (typeof SPEEDS)[number]
  view: View
  layer: Layer
  selection: Selection | null
  hover: string | null
  resetKey: number
  setDay: (day: Day, ms: number) => void
  setMode: (mode: Mode) => void
  setFeed: (feed: FeedStatus) => void
  applyFeed: (events: Stamped[], reset: boolean, at: number) => void
  resetView: () => void
  setT: (t: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: (typeof SPEEDS)[number]) => void
  setView: (v: View) => void
  setLayer: (l: Layer) => void
  select: (s: Selection | null) => void
  setHover: (id: string | null) => void
}

const VIEWS: View[] = ['3d', 'plan', 'list']
const LAYERS: Layer[] = ['beds', 'temp', 'air', 'calls']
const ASSET_ID = /^(IVP|VEN|WCH|PXR|BSC)-\d{2}$/

/** A shared link opens the same view: ?view=plan&layer=air&t=18:00&select=FAM, or ?mode=live */
function fromUrl() {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const view = VIEWS.find((v) => v === q.get('view')) ?? '3d'
  const layer = LAYERS.find((l) => l === q.get('layer')) ?? 'beds'
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(q.get('t') ?? '')
  const t = hhmm ? Math.min(1439, Number(hhmm[1]) * 60 + Number(hhmm[2])) : DEFAULT_TIME
  const id = (q.get('select') ?? '').toUpperCase()
  const selection: Selection | null = ROOM_BY_ID[id] ? { type: 'room', id } : ASSET_ID.test(id) ? { type: 'asset', id } : null
  const mode: Mode = q.get('mode') === 'live' ? 'live' : 'replay'
  const feed: FeedStatus = mode === 'live' ? { state: 'connecting', attempt: 0 } : { state: 'closed' }
  return { view, layer, t, replayT: t, selection, mode, feed }
}

export const useWard = create<WardState>((set) => ({
  day: null,
  recorded: null,
  simMs: 0,
  playing: false,
  speed: 15,
  ...fromUrl(),
  hover: null,
  resetKey: 0,
  setDay: (day, simMs) => set((s) => ({ recorded: day, simMs, ...(s.mode === 'replay' && { day }) })),
  setMode: (mode) =>
    set((s) => {
      if (mode === s.mode) return {}
      return mode === 'live'
        ? { mode, day: null, playing: false, replayT: s.t, feed: { state: 'connecting', attempt: 0 } }
        : { mode, day: s.recorded, t: s.replayT, feed: { state: 'closed' } }
    }),
  setFeed: (feed) => set({ feed }),
  // The feed closes after the switch back to replay has rendered, so a last frame of it can still arrive; it is dropped.
  applyFeed: (events, reset, at) =>
    set((s) => (s.mode === 'live' ? { day: applyEvents(reset || !s.day ? emptyDay(SEED) : s.day, events), t: Math.min(1439, at) } : {})),
  resetView: () => set((s) => ({ selection: null, resetKey: s.resetKey + 1 })),
  setT: (t) => set({ t: Math.max(0, Math.min(1439, t)) }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  setLayer: (layer) => set({ layer }),
  select: (selection) => set({ selection }),
  setHover: (hover) => set({ hover }),
}))

/** Keep the address bar in step, so any view can be copied and shared. */
export function syncUrl() {
  const clock = (m: number) => {
    const mm = Math.round(m)
    return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
  }
  let last = ''
  return useWard.subscribe((s) => {
    if (s.playing) return
    const live = s.mode === 'live'
    const q = new URLSearchParams(location.search)
    const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k))
    set('mode', live ? 'live' : null)
    set('view', s.view === '3d' ? null : s.view)
    set('layer', s.layer === 'beds' ? null : s.layer)
    // Live time is the feed's, so a live link carries no time.
    set('t', live || Math.round(s.t) === DEFAULT_TIME ? null : clock(s.t))
    set('select', s.selection?.id ?? null)
    const next = q.toString().replace(/%3A/g, ':')
    if (next === last) return
    last = next
    history.replaceState(null, '', next ? `?${next}` : location.pathname)
  })
}
