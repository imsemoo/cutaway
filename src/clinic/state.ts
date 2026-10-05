import { create } from 'zustand'
import type { Building } from '../data/building'
import type { Floors, Spread } from './layout'

/*
  What the clinic adds to the shared store (state/store.ts), which holds its
  day, the minute, the layer, the view and the selection as it does the
  hospital's: the building itself, which of its floors are on show, and
  where the scene lays the upper floor, as it decides from its size and the language.
*/
export const useClinic = create<{ building: Building | null; floors: Floors; spread: Spread; setFloors: (f: Floors) => void }>((set) => ({
  building: null,
  floors: 'all',
  spread: 'right',
  setFloors: (floors) => set({ floors }),
}))
