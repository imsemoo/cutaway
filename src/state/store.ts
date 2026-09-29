import { create } from 'zustand'
import { ROOMS, ROOM_BY_ID, STORY, WING_BY_CODE, wingOfAsset } from '../data/floorplan'

const ROOM_COUNT = ROOMS.length
import type { Day, Layer, Selection, View } from '../data/types'
import { applyEvents, emptyDay } from '../live/events'
import type { FeedStatus } from '../live/feed'
import type { Route } from '../lib/wayfinding'
import type { Stamped } from '../live/protocol'
import { isWing, scopeFromParam, scopeToParam, type Scope } from './scope'
import { SEED } from '../sim/simulate'

export const DEFAULT_TIME = 14 * 60 + 30
export const SPEEDS = [5, 15, 60] as const

/** Replay plays the recorded day; live builds the day from the feed as it arrives. */
export type Mode = 'replay' | 'live'

interface WardState {
  /** The day the views read: the recorded one in replay, the one the feed builds in live. */
  day: Day | null
  recorded: Day | null
  /** Whether the recorded day covers every wing yet: the one the page opens on arrives first. */
  complete: boolean
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
  scope: Scope
  selection: Selection | null
  /** The way to the nearest free piece of equipment, while it is on show. */
  route: Route | null
  hover: string | null
  resetKey: number
  setDay: (day: Day, ms: number, complete: boolean) => void
  setMode: (mode: Mode) => void
  setFeed: (feed: FeedStatus) => void
  applyFeed: (events: Stamped[], reset: boolean, at: number) => void
  resetView: () => void
  setT: (t: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: (typeof SPEEDS)[number]) => void
  setView: (v: View) => void
  setLayer: (l: Layer) => void
  setScope: (scope: Scope) => void
  select: (s: Selection | null) => void
  /** Shows a route, widening the view to hold it without losing the room it starts from. */
  showRoute: (route: Route | null, scope?: Scope) => void
  setHover: (id: string | null) => void
}

const VIEWS: View[] = ['3d', 'plan', 'list']
const LAYERS: Layer[] = ['beds', 'temp', 'air', 'calls']
const ASSET_ID = /^(IVP|VEN|WCH|PXR|BSC)-(\d[A-Z]-)?\d{2}$/

/** The wing a selection lives in. */
export const selectionWing = (s: Selection) => (s.type === 'room' ? ROOM_BY_ID[s.id]?.wing : wingOfAsset(s.id)) ?? STORY

/** A shared link opens the same view: ?view=plan&layer=air&t=18:00&select=FAM, ?at=level-4, or ?mode=live */
function fromUrl() {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const view = VIEWS.find((v) => v === q.get('view')) ?? '3d'
  const layer = LAYERS.find((l) => l === q.get('layer')) ?? 'beds'
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(q.get('t') ?? '')
  const t = hhmm ? Math.min(1439, Number(hhmm[1]) * 60 + Number(hhmm[2])) : DEFAULT_TIME
  const id = (q.get('select') ?? '').toUpperCase()
  const selection: Selection | null = ROOM_BY_ID[id] ? { type: 'room', id } : ASSET_ID.test(id) ? { type: 'asset', id } : null
  const scope: Scope = selection ? selectionWing(selection) : (scopeFromParam(q.get('at') ?? '') ?? STORY)
  const mode: Mode = q.get('mode') === 'live' ? 'live' : 'replay'
  const feed: FeedStatus = mode === 'live' ? { state: 'connecting', attempt: 0 } : { state: 'closed' }
  return { view, layer, t, replayT: t, scope, selection, mode, feed }
}

export const useWard = create<WardState>((set) => ({
  day: null,
  recorded: null,
  complete: false,
  simMs: 0,
  playing: false,
  speed: 15,
  ...fromUrl(),
  route: null,
  hover: null,
  resetKey: 0,
  setDay: (day, simMs, complete) => set((s) => ({ recorded: day, simMs, ...(s.mode === 'replay' && { day, complete }) })),
  setMode: (mode) =>
    set((s) => {
      if (mode === s.mode) return {}
      return mode === 'live'
        ? { mode, day: null, complete: false, playing: false, replayT: s.t, feed: { state: 'connecting', attempt: 0 } }
        : { mode, day: s.recorded, complete: s.recorded ? Object.keys(s.recorded.rooms).length === ROOM_COUNT : false, t: s.replayT, feed: { state: 'closed' } }
    }),
  setFeed: (feed) => set({ feed }),
  // The feed closes after the switch back to replay has rendered, so a last frame of it can still arrive; it is dropped.
  applyFeed: (events, reset, at) =>
    // A live day holds every wing from its first sync.
    set((s) => (s.mode === 'live' ? { day: applyEvents(reset || !s.day ? emptyDay(SEED) : s.day, events), complete: true, t: Math.min(1439, at) } : {})),
  resetView: () => set((s) => ({ selection: null, resetKey: s.resetKey + 1 })),
  setT: (t) => set({ t: Math.max(0, Math.min(1439, t)) }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view }),
  setLayer: (layer) => set({ layer }),
  // Leaving a wing leaves its selection behind.
  setScope: (scope) => set((s) => (scope === s.scope ? {} : { scope, selection: null, route: null, hover: null })),
  // Picking something anywhere goes to its wing.
  select: (selection) => set(selection ? { selection, scope: selectionWing(selection), route: null } : { selection, route: null }),
  showRoute: (route, scope) => set((s) => ({ route, scope: scope ?? s.scope })),
  setHover: (hover) => set({ hover }),
}))

/** Whether the day in hand covers what the scope shows: its wing, or, for a level or the hospital, every wing. */
export const covers = (s: WardState) =>
  s.day !== null && (isWing(s.scope) ? s.day.rooms[WING_BY_CODE[s.scope].rooms[0].id] !== undefined : s.complete)

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
    // A selection names its wing already.
    set('at', s.selection || s.scope === STORY ? null : scopeToParam(s.scope))
    // Live time is the feed's, so a live link carries no time.
    set('t', live || Math.round(s.t) === DEFAULT_TIME ? null : clock(s.t))
    set('select', s.selection?.id ?? null)
    const next = q.toString().replace(/%3A/g, ':')
    if (next === last) return
    last = next
    history.replaceState(null, '', next ? `?${next}` : location.pathname)
  })
}
