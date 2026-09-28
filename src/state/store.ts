import { create } from 'zustand'
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

export const useWard = create<WardState>((set) => ({
  day: null,
  simMs: 0,
  t: DEFAULT_TIME,
  playing: false,
  speed: 15,
  view: '3d',
  layer: 'beds',
  selection: null,
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
