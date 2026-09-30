import { WING, WING_BY_CODE, center } from '../data/floorplan'
import { isWing, scopeWings, type Scope } from '../state/scope'
import { levelY } from './layout'

/** A place the keyboard cursor can stop: a room in a wing, or a wing in a level or the whole hospital. */
export interface Spot {
  id: string
  x: number
  y: number
  z: number
}

export function spots(scope: Scope): Spot[] {
  if (isWing(scope)) return WING_BY_CODE[scope].rooms.map((r) => ({ id: r.id, ...center(r), y: levelY(r.level) }))
  return scopeWings(scope).map((w) => ({ id: w.code, x: w.x + WING.w / 2, y: levelY(w.level), z: w.z + WING.d / 2 }))
}

type OnScreen = { id: string; p: [number, number] }

/**
  Where an arrow key leads on screen: the nearest spot within 60 degrees of
  its direction, sideways distance counting double, so a step follows the
  row a person sees rather than jumping across it. Screen space, not the
  plan, so the arrows mean what they show however the camera has turned.
  None when nothing lies that way.
*/
export function towards(from: [number, number], dir: [number, number], candidates: OnScreen[]) {
  let best: string | undefined
  let score = Infinity
  for (const { id, p } of candidates) {
    const dx = p[0] - from[0]
    const dy = p[1] - from[1]
    const along = dx * dir[0] + dy * dir[1]
    const across = Math.abs(dx * dir[1] - dy * dir[0])
    if (along < 1 || across > along * Math.tan(Math.PI / 3)) continue
    const s = along + across * 2
    if (s < score) {
      score = s
      best = id
    }
  }
  return best
}

/** The spot nearest a point on screen, to start from. */
export function nearest(to: [number, number], candidates: OnScreen[]) {
  let best: string | undefined
  let score = Infinity
  for (const { id, p } of candidates) {
    const s = Math.hypot(p[0] - to[0], p[1] - to[1])
    if (s < score) {
      score = s
      best = id
    }
  }
  return best
}
