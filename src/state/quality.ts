import { create } from 'zustand'

/*
  Four rendering levels. Desktop starts at the top and phones one step
  down. AdaptiveQuality steps down when frames run slow while something
  moves, and back up once they recover.

    3  ambient occlusion and SMAA, pixel ratio up to 1.5
    2  ambient occlusion, pixel ratio up to 1.25
    1  no ambient occlusion; the canvas's own MSAA smooths edges, pixel ratio up to 1.25
    0  no ambient occlusion, pixel ratio 1

  ?quality=N pins a level, for measuring one against another.
*/
export type Quality = 0 | 1 | 2 | 3

const browser = typeof window !== 'undefined'
const coarse = browser && (matchMedia('(pointer: coarse)').matches || window.innerWidth < 760)
const asked = browser ? new URLSearchParams(location.search).get('quality') : null
const pin = asked !== null && /^[0-3]$/.test(asked) ? (Number(asked) as Quality) : null

export const PINNED = pin !== null
export const START: Quality = pin ?? (coarse ? 1 : 3)

export function dprFor(level: Quality): [number, number] {
  const device = browser ? window.devicePixelRatio || 1 : 1
  const cap = level === 3 ? 1.5 : level === 0 ? 1 : 1.25
  return [1, Math.min(device, cap)]
}

interface QualityState {
  level: Quality
  /** The WebGL context is lost; the scene is paused until it comes back. */
  lost: boolean
  /** Bumped to rebuild the canvas from scratch after a context loss. */
  epoch: number
  setLevel: (level: Quality) => void
  setLost: (lost: boolean) => void
  rebuild: () => void
}

export const useQuality = create<QualityState>((set) => ({
  level: START,
  lost: false,
  epoch: 0,
  setLevel: (level) => set({ level }),
  setLost: (lost) => set({ lost }),
  rebuild: () => set((s) => ({ lost: false, epoch: s.epoch + 1 })),
}))
