import { create } from 'zustand'
import { ROOM_BY_ID } from '../data/floorplan'
import type { Day, Layer, Selection, View } from '../data/types'

export const DEFAULT_TIME = 14 * 60 + 30
export const SPEEDS = [5, 15, 60] as const

interface WardState {
  day: Day | null
  simMs: number
  t: number
  playing: boolean
  speed: (typeof SPEEDS)[number]
  view: View
  layer: Layer
  selection: Selection | null
  hover: string | null
  resetKey: number
  setDay: (day: Day, ms: number) => void
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

/** A shared link opens the same view: ?view=plan&layer=air&t=18:00&select=FAM */
function fromUrl() {
  const q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
  const view = VIEWS.find((v) => v === q.get('view')) ?? '3d'
  const layer = LAYERS.find((l) => l === q.get('layer')) ?? 'beds'
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(q.get('t') ?? '')
  const t = hhmm ? Math.min(1439, Number(hhmm[1]) * 60 + Number(hhmm[2])) : DEFAULT_TIME
  const id = (q.get('select') ?? '').toUpperCase()
  const selection: Selection | null = ROOM_BY_ID[id] ? { type: 'room', id } : ASSET_ID.test(id) ? { type: 'asset', id } : null
  return { view, layer, t, selection }
}

export const useWard = create<WardState>((set) => ({
  day: null,
  simMs: 0,
  playing: false,
  speed: 15,
  ...fromUrl(),
  hover: null,
  resetKey: 0,
  setDay: (day, simMs) => set({ day, simMs }),
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
    const q = new URLSearchParams(location.search)
    const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k))
    set('view', s.view === '3d' ? null : s.view)
    set('layer', s.layer === 'beds' ? null : s.layer)
    set('t', Math.round(s.t) === DEFAULT_TIME ? null : clock(s.t))
    set('select', s.selection?.id ?? null)
    const next = q.toString().replace(/%3A/g, ':')
    if (next === last) return
    last = next
    history.replaceState(null, '', next ? `?${next}` : location.pathname)
  })
}
