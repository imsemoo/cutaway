/*
  Plan geometry for the IFC importer. A space or a wall comes out of the
  IFC file as a triangle mesh; what Cutaway draws is its footprint: the
  outline of its lowest face, seen from above. For a room that is its floor;
  for a wall, the strips of wall between door openings, since a door's
  opening runs down to the floor.

  Coordinates are metres, x east and z south as in the rest of Cutaway; the
  importer has already turned the IFC's z-up into y-up.
*/

export type Pt = [number, number]

/** A triangle mesh in world space: xyz triplets and their triangles. */
export interface Mesh {
  positions: ArrayLike<number>
  indices: ArrayLike<number>
}

const MM = 1000
const key = (x: number, z: number) => `${Math.round(x * MM)},${Math.round(z * MM)}`

/** The outlines of the lowest face of a set of meshes, as closed loops in plan, the largest first. */
export function footprint(meshes: Mesh[], tolerance = 0.01): Pt[][] {
  let low = Infinity
  for (const m of meshes) for (let i = 1; i < m.positions.length; i += 3) low = Math.min(low, m.positions[i])
  // Each edge of the bottom triangles, counted: an edge two of them share is inside the face, one alone is on its edge.
  const edges = new Map<string, { a: string; b: string; n: number }>()
  const points = new Map<string, Pt>()
  for (const m of meshes) {
    const p = m.positions
    for (let t = 0; t < m.indices.length; t += 3) {
      const tri = [m.indices[t], m.indices[t + 1], m.indices[t + 2]]
      if (!tri.every((v) => Math.abs(p[v * 3 + 1] - low) < tolerance)) continue
      const keys = tri.map((v) => {
        const k = key(p[v * 3], p[v * 3 + 2])
        if (!points.has(k)) points.set(k, [Math.round(p[v * 3] * MM) / MM, Math.round(p[v * 3 + 2] * MM) / MM])
        return k
      })
      if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) continue
      for (let e = 0; e < 3; e++) {
        const [a, b] = [keys[e], keys[(e + 1) % 3]]
        const id = a < b ? `${a}|${b}` : `${b}|${a}`
        const edge = edges.get(id)
        if (edge) edge.n++
        else edges.set(id, { a, b, n: 1 })
      }
    }
  }
  // Walk the lone edges into loops.
  const next = new Map<string, string[]>()
  for (const { a, b, n } of edges.values()) {
    if (n !== 1) continue
    next.set(a, [...(next.get(a) ?? []), b])
    next.set(b, [...(next.get(b) ?? []), a])
  }
  const used = new Set<string>()
  const loops: Pt[][] = []
  for (const start of next.keys()) {
    for (const first of next.get(start)!) {
      if (used.has(start < first ? `${start}|${first}` : `${first}|${start}`)) continue
      const loop: string[] = [start]
      let prev = start
      let at = first
      used.add(start < first ? `${start}|${first}` : `${first}|${start}`)
      while (at !== start) {
        loop.push(at)
        const onward = (next.get(at) ?? []).find((n) => n !== prev && !used.has(at < n ? `${at}|${n}` : `${n}|${at}`))
        if (!onward) break
        used.add(at < onward ? `${at}|${onward}` : `${onward}|${at}`)
        prev = at
        at = onward
      }
      if (at === start && loop.length >= 3) loops.push(simplify(loop.map((k) => points.get(k)!)))
    }
  }
  return loops.filter((l) => l.length >= 3).sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))
}

/** Signed area by the shoelace formula: positive when the loop runs one way, negative the other. */
export function area(loop: Pt[]) {
  let s = 0
  for (let i = 0; i < loop.length; i++) {
    const [x1, z1] = loop[i]
    const [x2, z2] = loop[(i + 1) % loop.length]
    s += x1 * z2 - x2 * z1
  }
  return s / 2
}

/** Drops points that sit on the straight line between their neighbours, within a few millimetres. */
export function simplify(loop: Pt[], tolerance = 0.005): Pt[] {
  let out = loop
  for (let changed = true; changed && out.length > 3; ) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]
      const b = out[i]
      const c = out[(i + 1) % out.length]
      const len = Math.hypot(c[0] - a[0], c[1] - a[1])
      const off = len === 0 ? 0 : Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / len
      if (off < tolerance) {
        out = [...out.slice(0, i), ...out.slice(i + 1)]
        changed = true
        break
      }
    }
  }
  return out
}

export function inside([x, z]: Pt, loop: Pt[]) {
  let hit = false
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, zi] = loop[i]
    const [xj, zj] = loop[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit
  }
  return hit
}

/** Distance from a point to the nearest edge of a loop. */
function clearance([x, z]: Pt, loop: Pt[]) {
  let d = Infinity
  for (let i = 0; i < loop.length; i++) {
    const [ax, az] = loop[i]
    const [bx, bz] = loop[(i + 1) % loop.length]
    const len2 = (bx - ax) ** 2 + (bz - az) ** 2
    const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len2)) : 0
    d = Math.min(d, Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))))
  }
  return d
}

/** Where a room's label goes: the point inside it farthest from its walls, found on a grid. An L-shaped room's centroid can fall outside it. */
export function labelPoint(loop: Pt[], steps = 24): Pt {
  const xs = loop.map((p) => p[0])
  const zs = loop.map((p) => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  let best: Pt = [(x0 + x1) / 2, (z0 + z1) / 2]
  let far = -1
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p: Pt = [x0 + ((x1 - x0) * i) / steps, z0 + ((z1 - z0) * j) / steps]
      if (!inside(p, loop)) continue
      const d = clearance(p, loop)
      if (d > far) [best, far] = [p, d]
    }
  }
  return best
}
