import { ROOM_BY_ID, slotPosition } from '../data/floorplan'
import type { Asset, Day } from '../data/types'
import { assetAt } from './query'

let memo: { day: Day; t: number; out: Map<string, { x: number; z: number }> } | undefined

/**
  Where every asset stands at minute t: grouped by location, one slot each.
  Every kind of equipment, the overlays and the camera ask for the same
  minute, so the last answer is kept.
*/
export function assetPositions(day: Day, t: number) {
  if (memo?.day === day && memo.t === t) return memo.out
  const byLoc = new Map<string, Asset[]>()
  for (const a of day.assets) {
    const loc = assetAt(a, t).loc
    const list = byLoc.get(loc)
    if (list) list.push(a)
    else byLoc.set(loc, [a])
  }
  const out = new Map<string, { x: number; z: number }>()
  for (const [loc, list] of byLoc) {
    const room = ROOM_BY_ID[loc]
    list.sort((a, b) => a.id.localeCompare(b.id)).forEach((a, i) => out.set(a.id, slotPosition(room, i, list.length)))
  }
  memo = { day, t, out }
  return out
}
