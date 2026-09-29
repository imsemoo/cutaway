import { CORRIDORS, CORRIDOR_W, CROSSING_X, LINKS, ROOM_BY_ID, WING, WINGS, center } from '../data/floorplan'
import type { AssetKind, Day, Room } from '../data/types'
import { assetAt } from './query'

/*
  Finding the way: a graph of where people walk in the hospital, and the
  nearest free piece of equipment of a kind, by walking time.

  Nodes stand in every room, at its door on the corridor's centre line, at
  both ends of every corridor, where a wing's two corridors meet through
  the core, along the glazed links, and at every lift. Edges run along the
  corridors and links, through the doors, and up and down the lifts. Costs
  are seconds: a walk at 1.2 m/s, a lift as a wait and a few seconds a floor.

  "Which free pump is nearest?" has many answers to weigh, so one Dijkstra
  search from the room reaches all of them at once, where A* would need a
  search per pump.
*/

const WALK = 1.2 // metres per second, pushing equipment down a corridor
const LIFT_WAIT = 15 // seconds each way between a lobby and its lift car
const LIFT_FLOOR = 6 // seconds a floor

export interface Point {
  x: number
  z: number
  level: number
}

interface Graph {
  points: Point[]
  edges: { to: number; cost: number; metres: number }[][]
  index: Map<string, number>
}

let built: Graph | undefined

/** The walking graph of the whole hospital, built once. */
export function graph(): Graph {
  if (built) return built
  const points: Point[] = []
  const edges: Graph['edges'] = []
  const index = new Map<string, number>()
  const node = (key: string, p: Point) => {
    let i = index.get(key)
    if (i === undefined) {
      i = points.push(p) - 1
      edges.push([])
      index.set(key, i)
    }
    return i
  }
  const join = (a: number, b: number, metres: number, cost = metres / WALK) => {
    edges[a].push({ to: b, cost, metres })
    edges[b].push({ to: a, cost, metres })
  }
  const walk = (a: number, b: number) => {
    const p = points[a]
    const q = points[b]
    join(a, b, Math.hypot(p.x - q.x, p.z - q.z))
  }
  // The ends of every corridor, where the links meet them: level, x and z.
  const ends = new Map<string, number>()
  const at = (level: number, x: number, z: number) => `${level}:${x.toFixed(2)}:${z.toFixed(2)}`

  for (const w of WINGS) {
    const lane = (c: number) => w.z + CORRIDORS[c] + CORRIDOR_W / 2
    const on = [new Map<number, number>(), new Map<number, number>()]
    const stop = (c: number, x: number) => {
      const i = node(`${w.code}:${c}:${x.toFixed(2)}`, { x, z: lane(c), level: w.level })
      on[c].set(x, i)
      return i
    }
    for (const c of [0, 1]) {
      for (const x of [w.x, w.x + WING.w]) ends.set(at(w.level, x, lane(c)), stop(c, x))
    }
    // The core's one gap joins the two corridors.
    walk(stop(0, w.x + CROSSING_X), stop(1, w.x + CROSSING_X))

    for (const r of w.rooms) {
      if (!r.door) continue
      const x = r.x + r.door.at
      const doorZ = r.door.side === 's' ? r.z + r.d : r.z
      const c = Math.abs(doorZ - lane(0)) < Math.abs(doorZ - lane(1)) ? 0 : 1
      const inside = node(`room:${r.id}`, { ...center(r), level: w.level })
      const door = node(`door:${r.id}`, { x, z: doorZ, level: w.level })
      walk(inside, door)
      walk(door, stop(c, x))
    }
    // Each corridor, stop by stop along its length.
    for (const stops of on) {
      const xs = [...stops.keys()].sort((a, b) => a - b)
      for (let k = 1; k < xs.length; k++) walk(stops.get(xs[k - 1])!, stops.get(xs[k])!)
    }
    // The lift: from the lobby to the car, and between floors to the wing stacked above.
    const lobby = index.get(`room:${w.lobby}`)!
    const car = node(`lift:${w.code}`, { ...points[lobby] })
    join(lobby, car, 0, LIFT_WAIT)
    const above = WINGS.find((o) => o.level === w.level + 1 && o.x === w.x && o.z === w.z)
    if (above) join(car, node(`lift:${above.code}`, { ...points[lobby], level: above.level }), 0, LIFT_FLOOR)
  }

  // A row link joins two corridor ends through its middle; a street link joins the middles of two row links.
  const middle = (level: number, x: number, z: number) => node(`link:${at(level, x, z)}`, { x, z, level })
  for (const l of LINKS.filter((k) => k.axis === 'x')) {
    const z = l.z + CORRIDOR_W / 2
    const mid = middle(l.level, l.x + l.length / 2, z)
    walk(ends.get(at(l.level, l.x, z))!, mid)
    walk(mid, ends.get(at(l.level, l.x + l.length, z))!)
  }
  for (const l of LINKS.filter((k) => k.axis === 'z')) {
    const x = l.x + CORRIDOR_W / 2
    walk(middle(l.level, x, l.z - CORRIDOR_W / 2), middle(l.level, x, l.z + l.length + CORRIDOR_W / 2))
  }
  built = { points, edges, index }
  return built
}

/** Seconds from one room to every place, and the step back towards it from each. */
function reach(from: number) {
  const { edges } = graph()
  const seconds = new Float64Array(edges.length).fill(Infinity)
  const back = new Int32Array(edges.length).fill(-1)
  seconds[from] = 0
  // A binary heap of [seconds, node]; a node can sit in it more than once, and the stale copies are skipped.
  const heap: [number, number][] = [[0, from]]
  const up = (i: number) => {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const down = (i: number) => {
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let m = i
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r
      if (m === i) return
      ;[heap[m], heap[i]] = [heap[i], heap[m]]
      i = m
    }
  }
  while (heap.length) {
    const [s, n] = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      down(0)
    }
    if (s > seconds[n]) continue
    for (const e of edges[n]) {
      const next = s + e.cost
      if (next < seconds[e.to]) {
        seconds[e.to] = next
        back[e.to] = n
        heap.push([next, e.to])
        up(heap.length - 1)
      }
    }
  }
  return { seconds, back }
}

export interface Route {
  /** The room the search started from. */
  from: string
  asset: string
  /** The room the asset stands in. */
  at: string
  seconds: number
  /** Metres on foot, lift rides left out. */
  metres: number
  points: Point[]
}

/** The free piece of equipment of a kind that is quickest to reach from a room at minute t, and the way there. */
export function nearestFree(day: Day, t: number, from: Room, kind: AssetKind): Route | undefined {
  const g = graph()
  const start = g.index.get(`room:${from.id}`)
  if (start === undefined) return undefined
  const { seconds, back } = reach(start)
  let best: { asset: string; at: string; node: number } | undefined
  for (const a of day.assets) {
    if (a.kind !== kind) continue
    const s = assetAt(a, t)
    if (s.status !== 'available') continue
    const node = g.index.get(`room:${s.loc}`)
    if (node === undefined || seconds[node] === Infinity) continue
    if (!best || seconds[node] < seconds[best.node]) best = { asset: a.id, at: s.loc, node }
  }
  if (!best) return undefined
  const path: number[] = []
  for (let n = best.node; n !== -1; n = back[n]) path.push(n)
  path.reverse()
  let metres = 0
  for (let k = 1; k < path.length; k++) metres += g.edges[path[k - 1]].find((e) => e.to === path[k])!.metres
  return { from: from.id, asset: best.asset, at: best.at, seconds: seconds[best.node], metres, points: path.map((n) => g.points[n]) }
}

/** Whether a route stays inside one wing, one level, or crosses levels: what the view must show to hold it. */
export function routeReach(route: Route): 'wing' | 'level' | 'hospital' {
  const levels = new Set(route.points.map((p) => p.level))
  if (levels.size > 1) return 'hospital'
  return ROOM_BY_ID[route.from].wing === ROOM_BY_ID[route.at].wing ? 'wing' : 'level'
}
