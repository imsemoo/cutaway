import type { Building, BuildingSpace } from '../data/building'

/*
  Where the clinic's floors are drawn. One floor on its own sits at the
  origin. Both together lie apart, as on a drawing sheet: side by side on
  a wide screen, in the reading order of the language on show, and the
  upper floor beyond the lower on a tall one. Stacked, the upper floor
  would hide the lower one's rooms.
*/

/** Which floors are on show: both, or one by its index. */
export type Floors = 'all' | number

/** Where the upper floor lies from the lower one. */
export type Spread = 'right' | 'left' | 'beyond'

/** The walls' height in 3D: cut low, so the rooms' floors and their colours show from above. */
export const WALL = 1.2
const GAP = 8

export function floorOffset(building: Building, storey: number, floors: Floors, spread: Spread) {
  if (floors !== 'all') return { x: 0, z: 0 }
  if (spread === 'beyond') return { x: 0, z: -storey * (building.size.d + GAP) }
  return { x: (spread === 'right' ? storey : -storey) * (building.size.w + GAP), z: 0 }
}

/** The extent of what is on show, for the camera to frame. */
export function extent(building: Building, floors: Floors, spread: Spread) {
  const offsets = (floors === 'all' ? building.storeys.map((_, i) => i) : [floors]).map((i) => floorOffset(building, i, floors, spread))
  const xs = offsets.map((o) => o.x)
  const zs = offsets.map((o) => o.z)
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs) + building.size.w, z1: Math.max(...zs) + building.size.d }
}

export const shows = (space: BuildingSpace, floors: Floors) => floors === 'all' || space.storey === floors
