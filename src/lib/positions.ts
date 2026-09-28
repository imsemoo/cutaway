import { ROOM_BY_ID, slotPosition } from '../data/floorplan'
import type { Asset, Day } from '../data/types'
import { assetAt } from './query'

/** Where every asset stands at minute t: grouped by location, one slot each. */
export function assetPositions(day: Day, t: number) {
  const byLoc = new Map<string, Asset[]>()
  for (const a of day.assets) {
    const loc = assetAt(a, t).loc
    byLoc.set(loc, [...(byLoc.get(loc) ?? []), a])
  }
  const out = new Map<string, { x: number; z: number }>()
  for (const [loc, list] of byLoc) {
    const room = ROOM_BY_ID[loc]
    list.sort((a, b) => a.id.localeCompare(b.id)).forEach((a, i) => out.set(a.id, slotPosition(room, i)))
  }
  return out
}
