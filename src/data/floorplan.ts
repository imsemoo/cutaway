import type { Room } from './types'

/*
  Level 4 of a fictional general hospital, in metres.
  A double-loaded ward: patient rooms on both faces, a service core
  between two corridors, and a six-bay ICU pod at the east end.

      x=0                                                    x=54    x=68
  z=0  | 4A01 … 4A12 (single rooms)                           | ICU 4C01-03 |
  7.5  |  corridor A ────────────────────────────────────────────────────── |
  10.5 | lifts | clean | meds | nurse station | soiled | equip | staff | stair |  | ICU station |
  15.5 |  corridor B ────────────────────────────────────────────────────── |
  18.5 | 4B01 … 4B10                     | family lounge      | ICU 4C04-06 |
  26
*/

export const FLOOR = { w: 68, d: 26, wallHeight: 2.7, lowHeight: 1.05 }

const ROOM_W = 4.5
const pad = (n: number) => String(n).padStart(2, '0')

const rooms: Room[] = []

for (let i = 0; i < 12; i++) {
  rooms.push({
    id: `4A${pad(i + 1)}`,
    name: `Patient room 4A${pad(i + 1)}`,
    kind: 'patient',
    x: i * ROOM_W, z: 0, w: ROOM_W, d: 7.5,
    door: { side: 's', at: 3.5, width: 1.3 },
    head: 'n',
  })
}

for (let i = 0; i < 10; i++) {
  rooms.push({
    id: `4B${pad(i + 1)}`,
    name: `Patient room 4B${pad(i + 1)}`,
    kind: 'patient',
    x: i * ROOM_W, z: 18.5, w: ROOM_W, d: 7.5,
    door: { side: 'n', at: 3.5, width: 1.3 },
    head: 's',
  })
}

const ICU_W = 14 / 3
for (let i = 0; i < 3; i++) {
  rooms.push({
    id: `4C${pad(i + 1)}`,
    name: `ICU bay 4C${pad(i + 1)}`,
    kind: 'icu',
    x: 54 + i * ICU_W, z: 0, w: ICU_W, d: 7.5,
    door: { side: 's', at: ICU_W / 2, width: 1.6 },
    glass: 's',
    head: 'n',
  })
  rooms.push({
    id: `4C${pad(i + 4)}`,
    name: `ICU bay 4C${pad(i + 4)}`,
    kind: 'icu',
    x: 54 + i * ICU_W, z: 18.5, w: ICU_W, d: 7.5,
    door: { side: 'n', at: ICU_W / 2, width: 1.6 },
    glass: 'n',
    head: 's',
  })
}

const core = (id: string, name: string, x: number, w: number, side: 'n' | 's', extra: Partial<Room> = {}): Room => ({
  id, name, kind: 'support', x, z: 10.5, w, d: 5,
  door: { side, at: w / 2, width: 1.4 },
  ...extra,
})

rooms.push(
  core('LIFT', 'Lift lobby', 0, 8, 'n', { kind: 'core', door: { side: 'n', at: 4, width: 4 } }),
  core('CLN', 'Clean utility', 8, 6, 'n'),
  core('MED', 'Medication room', 14, 6, 's'),
  core('NS', 'Nurse station', 20, 12, 'n', { kind: 'station', low: true, door: { side: 's', at: 6, width: 3 } }),
  core('SOIL', 'Soiled utility', 32, 6, 's'),
  core('EQP', 'Equipment store', 38, 6, 'n'),
  core('STAFF', 'Staff room', 44, 6, 's'),
  core('STAIR', 'Stair B', 50, 4, 'n', { kind: 'core' }),
  core('ICUS', 'ICU station', 56, 12, 'n', { kind: 'station', low: true, door: { side: 's', at: 6, width: 3 } }),
  {
    id: 'FAM', name: 'Family lounge', kind: 'lounge',
    x: 45, z: 18.5, w: 9, d: 7.5,
    door: { side: 'n', at: 4.5, width: 2 },
  },
)

export const ROOMS = rooms
export const ROOM_BY_ID: Record<string, Room> = Object.fromEntries(rooms.map((r) => [r.id, r]))
export const BED_ROOMS = rooms.filter((r) => r.kind === 'patient' || r.kind === 'icu')

export const center = (r: Room) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 })

/** Bed position and heading: the head of the bed against the outside wall. */
export function bedPose(r: Room) {
  const c = center(r)
  const off = r.d / 2 - 1.35
  if (r.head === 'n') return { x: c.x, z: c.z - off, rot: 0 }
  return { x: c.x, z: c.z + off, rot: Math.PI }
}

/** Where the n-th piece of equipment stands inside a room. */
export function slotPosition(r: Room, slot: number): { x: number; z: number } {
  if (r.kind === 'patient' || r.kind === 'icu') {
    const b = bedPose(r)
    const dir = r.head === 'n' ? 1 : -1
    const spots = [
      { x: b.x + 0.95, z: b.z - dir * 0.55 },
      { x: b.x - 0.95, z: b.z - dir * 0.55 },
      { x: b.x + 1.25, z: b.z + dir * 0.6 },
      { x: b.x - 1.25, z: b.z + dir * 0.6 },
      { x: b.x + 1.2, z: b.z + dir * 1.6 },
      { x: b.x - 1.2, z: b.z + dir * 1.6 },
    ]
    return spots[slot % spots.length]
  }
  // Storage and lobbies: a grid that fills from the back wall.
  const cols = Math.max(1, Math.floor((r.w - 1) / 0.85))
  const col = slot % cols
  const row = Math.floor(slot / cols)
  return { x: r.x + 0.9 + col * 0.85, z: r.z + 0.9 + row * 0.95 }
}
