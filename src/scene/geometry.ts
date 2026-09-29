import { BoxGeometry, BufferGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STOREY, STORY, WING, WING_BY_CODE } from '../data/floorplan'
import type { AssetKind, Room, Side } from '../data/types'

export const WALL_T = 0.14

type Seg = [number, number]

/** Split a wall run around its door opening. */
function runs(length: number, door?: { at: number; width: number }): Seg[] {
  if (!door) return [[0, length]]
  const a = door.at - door.width / 2
  const b = door.at + door.width / 2
  return ([[0, a], [b, length]] as Seg[]).filter(([s, e]) => e - s > 0.05)
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

/** One side of a room as wall boxes, inset so neighbours never overlap. */
function side(r: Room, s: Side, h: number, out: BufferGeometry[]) {
  const door = r.door?.side === s ? r.door : undefined
  const horizontal = s === 'n' || s === 's'
  if (horizontal) {
    const z = s === 'n' ? r.z + WALL_T / 2 : r.z + r.d - WALL_T / 2
    for (const [a, b] of runs(r.w, door)) out.push(box(b - a, h, WALL_T, r.x + (a + b) / 2, h / 2, z))
  } else {
    const x = s === 'w' ? r.x + WALL_T / 2 : r.x + r.w - WALL_T / 2
    // Side walls stop short of the corners, which the long walls own.
    const len = r.d - WALL_T * 2
    const shifted = door ? { at: door.at - WALL_T, width: door.width } : undefined
    for (const [a, b] of runs(len, shifted)) out.push(box(WALL_T, h, b - a, x, h / 2, r.z + WALL_T + (a + b) / 2))
  }
}

/**
  One wing's shell in the wing's own coordinates. Every wing in the tower
  is built to the same plan, so the whole hospital draws it as instances:
  one draw call per part for all 36 wings.
*/
export function buildShell() {
  const walls: BufferGeometry[] = []
  const low: BufferGeometry[] = []
  const glass: BufferGeometry[] = []
  const fixtures: BufferGeometry[] = []
  const H = STOREY.wallHeight
  const template = WING_BY_CODE[STORY]

  for (const room of template.rooms) {
    const r = { ...room, x: room.x - template.x, z: room.z - template.z }
    for (const s of ['n', 's', 'w', 'e'] as Side[]) {
      if (r.glass === s) side(r, s, H, glass)
      else side(r, s, r.low ? STOREY.lowHeight : H, r.low ? low : walls)
    }
  }

  // Glazed ends of both corridors.
  for (const x of [WALL_T / 2, WING.w - WALL_T / 2]) {
    glass.push(box(WALL_T, H, 3, x, H / 2, 9))
    glass.push(box(WALL_T, H, 3, x, H / 2, 17))
  }

  // Three lift cars against the back of the lobby.
  for (let i = 0; i < 3; i++) fixtures.push(box(2.1, H, 1.8, 1.35 + i * 2.6, H / 2, 14.4))
  // Stair flights.
  for (let i = 0; i < 8; i++) fixtures.push(box(1.5, 0.18 * (i + 1), 0.3, 51.1, (0.18 * (i + 1)) / 2, 11.2 + i * 0.3))
  // Counters inside both stations.
  fixtures.push(box(8, 0.95, 0.7, 26, 0.475, 13))
  fixtures.push(box(8, 0.95, 0.7, 62, 0.475, 13))
  // Lounge seating.
  for (let i = 0; i < 3; i++) fixtures.push(box(2.2, 0.45, 0.8, 47.3 + i * 2.6, 0.225, 24.6))

  const merge = (list: BufferGeometry[]) => {
    const g = mergeGeometries(list, false)
    list.forEach((x) => x.dispose())
    return g
  }
  return { walls: merge(walls), low: merge(low), glass: merge(glass), fixtures: merge(fixtures) }
}

/** Low-poly equipment, each kind one merged geometry so a kind is one draw call. */
export function assetGeometry(kind: AssetKind): BufferGeometry {
  const parts: BufferGeometry[] = []
  const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number) => {
    const g = new CylinderGeometry(rt, rb, h, 14)
    g.translate(x, y, z)
    return g
  }
  switch (kind) {
    case 'pump':
      parts.push(cyl(0.22, 0.26, 0.05, 0, 0.025, 0), cyl(0.025, 0.025, 1.55, 0, 0.8, 0), box(0.24, 0.3, 0.16, 0, 1.15, 0.08), box(0.24, 0.2, 0.16, 0, 0.85, 0.08))
      break
    case 'vent':
      parts.push(box(0.55, 0.12, 0.55, 0, 0.1, 0), box(0.5, 0.75, 0.45, 0, 0.55, 0), box(0.44, 0.34, 0.06, 0, 1.12, 0.12))
      break
    case 'chair': {
      parts.push(box(0.5, 0.08, 0.48, 0, 0.5, 0), box(0.5, 0.5, 0.06, 0, 0.8, -0.24))
      for (const x of [0.27, -0.27]) {
        const wheel = new CylinderGeometry(0.28, 0.28, 0.04, 14)
        wheel.rotateZ(Math.PI / 2)
        wheel.translate(x, 0.3, 0)
        parts.push(wheel)
      }
      break
    }
    case 'xray':
      parts.push(box(0.7, 0.8, 1.0, 0, 0.45, 0), cyl(0.05, 0.05, 1.3, 0, 1.4, -0.3), box(0.2, 0.08, 1.0, 0, 2.02, 0.15), box(0.38, 0.22, 0.3, 0, 1.9, 0.6))
      break
    case 'scanner':
      parts.push(cyl(0.2, 0.24, 0.05, 0, 0.025, 0), cyl(0.03, 0.03, 0.95, 0, 0.5, 0), box(0.3, 0.26, 0.18, 0, 1.05, 0))
      break
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)
  parts.forEach((p) => p.dispose())
  merged.computeVertexNormals()
  return merged
}

export const ringGeometry = () => new TorusGeometry(0.62, 0.05, 8, 48).rotateX(Math.PI / 2)
export const dotGeometry = () => new SphereGeometry(0.1, 12, 8)
