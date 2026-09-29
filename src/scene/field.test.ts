import { describe, expect, it } from 'vitest'
import { CORRIDORS, CORRIDOR_W, ROOMS, WINGS } from '../data/floorplan'
import { DOORS, ROW } from './field'

describe('the corridor field', () => {
  it('has a door for every room, each on the edge of a corridor', () => {
    const edges = CORRIDORS.flatMap((z) => [z, z + CORRIDOR_W])
    DOORS.forEach((d, i) => expect(edges.some((z) => Math.abs(d.at.y - z) < 1e-9), WINGS[0].rooms[i].id).toBe(true))
  })

  it("finds a room's reading where the shader looks: a row per wing, the plan's order along it", () => {
    const [plan] = WINGS
    WINGS.forEach((w, row) => {
      expect(ROW.get(w.code)).toBe(row)
      w.rooms.forEach((r, i) => {
        expect(ROOMS[row * DOORS.length + i]).toBe(r)
        // Every wing is the plan, room for room, so one set of doors serves them all.
        const p = plan.rooms[i]
        const planned = [p.x - plan.x, p.z - plan.z, p.w, p.d]
        ;[r.x - w.x, r.z - w.z, r.w, r.d].forEach((v, k) => expect(v).toBeCloseTo(planned[k], 9))
        expect(r.door).toEqual(p.door)
      })
    })
  })
})
