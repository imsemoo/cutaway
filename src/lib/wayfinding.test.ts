import { describe, expect, it } from 'vitest'
import { CORRIDOR_W, ROOMS, ROOM_BY_ID, WING, center } from '../data/floorplan'
import type { Day } from '../data/types'
import { simulate } from '../sim/simulate'
import { DEFAULT_TIME } from '../state/store'
import { graph, nearestFree, routeReach } from './wayfinding'

const day = simulate()
const room = (id: string) => ROOM_BY_ID[id]

/** The day with every piece of a kind busy all day, except the one given. */
function onlyFree(kind: string, id: string): Day {
  return {
    ...day,
    assets: day.assets.map((a) => (a.kind !== kind || a.id === id ? a : { ...a, spans: [{ from: 0, to: 1440, loc: a.spans[0].loc, status: 'in-use' as const }] })),
  }
}

describe('finding the way', () => {
  it('reaches every room in the hospital from any room', () => {
    const g = graph()
    const seen = new Set([g.index.get('room:4A09')!])
    const queue = [...seen]
    while (queue.length) {
      for (const e of g.edges[queue.pop()!]) {
        if (seen.has(e.to)) continue
        seen.add(e.to)
        queue.push(e.to)
      }
    }
    for (const r of ROOMS) expect(seen.has(g.index.get(`room:${r.id}`)!), r.id).toBe(true)
  })

  it('finds a free pump for 4A09 at 14:30 in its own wing, a short walk away', () => {
    const route = nearestFree(day, DEFAULT_TIME, room('4A09'), 'pump')!
    expect(route).toBeDefined()
    expect(ROOM_BY_ID[route.at].wing).toBe('4A')
    expect(routeReach(route)).toBe('wing')
    expect(route.seconds).toBeLessThan(90)
    // It starts in the room and ends where the pump stands.
    expect(route.points[0]).toMatchObject(center(room('4A09')))
    expect(route.points.at(-1)).toMatchObject(center(room(route.at)))
  })

  it('walks, never cuts through walls: outside the two rooms every leg follows a corridor, a door or a link', () => {
    const route = nearestFree(day, DEFAULT_TIME, room('4B09'), 'chair')!
    // Inside a room the way to its door may run at a slant; the first and last legs are those.
    for (let k = 2; k < route.points.length - 1; k++) {
      const [p, q] = [route.points[k - 1], route.points[k]]
      // Legs run along x or along z, never on a slant.
      expect(Math.min(Math.abs(p.x - q.x), Math.abs(p.z - q.z)), JSON.stringify([p, q])).toBeLessThan(1e-6)
    }
  })

  it('crosses a glazed link to the next wing when its own has nothing free', () => {
    const only = day.assets.find((a) => a.kind === 'xray' && a.wing === '4D')!
    const route = nearestFree(onlyFree('xray', only.id), DEFAULT_TIME, room('4A09'), 'xray')!
    expect(route.asset).toBe(only.id)
    expect(routeReach(route)).toBe('level')
    // Somewhere on the way it is in the street between the two wings.
    expect(route.points.some((p) => p.x > WING.w && p.x < WING.w + 8)).toBe(true)
  })

  it('takes the lift to another level, and counts the ride in time but not in metres', () => {
    const only = day.assets.find((a) => a.kind === 'xray' && a.wing === '2A')!
    const route = nearestFree(onlyFree('xray', only.id), DEFAULT_TIME, room('4A09'), 'xray')!
    expect(route.asset).toBe(only.id)
    expect(routeReach(route)).toBe('hospital')
    expect(new Set(route.points.map((p) => p.level))).toEqual(new Set([4, 3, 2]))
    expect(route.seconds).toBeGreaterThan(route.metres / 1.2 + 20)
  })

  it('reaches the other row of wings through a street link, not the lift', () => {
    const only = day.assets.find((a) => a.kind === 'xray' && a.wing === '4K')!
    const route = nearestFree(onlyFree('xray', only.id), DEFAULT_TIME, room('4A09'), 'xray')!
    expect(new Set(route.points.map((p) => p.level))).toEqual(new Set([4]))
    // One leg runs down the street between the first two columns, from the north row to the south row.
    const street = route.points.some((p, k) => {
      const q = route.points[k + 1]
      return q && Math.abs(p.x - (WING.w + 4)) < CORRIDOR_W / 2 && Math.abs(q.x - p.x) < 1e-6 && Math.min(p.z, q.z) < WING.d && Math.max(p.z, q.z) > 40
    })
    expect(street).toBe(true)
  })

  it('has nothing to offer when nothing of the kind is free', () => {
    const busy = { ...day, assets: day.assets.map((a) => (a.kind === 'scanner' ? { ...a, spans: [{ from: 0, to: 1440, loc: a.spans[0].loc, status: 'in-use' as const }] } : a)) }
    expect(nearestFree(busy, DEFAULT_TIME, room('4A09'), 'scanner')).toBeUndefined()
  })
})
