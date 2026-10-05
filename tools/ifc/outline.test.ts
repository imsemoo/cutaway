import { describe, expect, it } from 'vitest'
import { area, footprint, inside, labelPoint, simplify, type Mesh, type Pt } from './outline'

/** A box from (x0, y0, z0) to (x1, y1, z1), as twelve triangles. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Mesh {
  const positions = [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1]
  const indices = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]
  return { positions, indices }
}

describe('the footprint of a mesh', () => {
  it('is the outline of its lowest face', () => {
    const [loop, ...rest] = footprint([box(1, 0, 2, 5, 2.7, 4)])
    expect(rest).toEqual([])
    expect(Math.abs(area(loop))).toBeCloseTo(8)
    expect(loop.map(([x, z]) => `${x},${z}`).sort()).toEqual(['1,2', '1,4', '5,2', '5,4'])
  })

  it('follows an L-shaped room, and finds a point inside it for its label', () => {
    // One solid, as a room's is: its floor and ceiling triangulated from the same six corners.
    const corners = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]
    const positions = [...corners.flatMap(([x, z]) => [x, 0, z]), ...corners.flatMap(([x, z]) => [x, 3, z])]
    const fan = [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]
    const [loop, ...rest] = footprint([{ positions, indices: [...fan, ...fan.map((i) => i + 6)] }])
    expect(rest).toEqual([])
    expect(loop).toHaveLength(6)
    expect(Math.abs(area(loop))).toBeCloseTo(7)
    // The corner of the L, where a centroid would fall outside it.
    expect(inside(labelPoint(loop), loop)).toBe(true)
  })

  it('keeps the strips of a wall a door opening runs through as separate outlines', () => {
    const loops = footprint([box(0, 0, 0, 2, 2.7, 0.12), box(3, 0, 0, 6, 2.7, 0.12), box(2, 2.1, 0, 3, 2.7, 0.12)])
    expect(loops).toHaveLength(2)
    expect(loops.map((l) => Math.abs(area(l))).map((a) => a.toFixed(2))).toEqual(['0.36', '0.24'])
  })

  it('drops points on a straight edge', () => {
    const square: Pt[] = [[0, 0], [1, 0], [2, 0], [2, 2], [0, 2], [0, 1]]
    expect(simplify(square)).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]])
  })
})
