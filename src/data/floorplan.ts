import type { Room } from './types'

/*
  A fictional inpatient tower, in metres. Six levels, and on each level six
  identical wings in two rows of three. A wing is a double-loaded ward
  block; in its own coordinates:

      x=0                                                    x=54    x=68
  z=0  | 4A01 … 4A12 (single rooms)                           | ICU 4C01-03 |
  7.5  |  corridor A ────────────────────────────────────────────────────── |
  10.5 | lifts | clean | meds | nurse station | soiled | equip | staff | stair |  | ICU station |
  15.5 |  corridor B ────────────────────────────────────────────────────── |
  18.5 | 4B01 … 4B10                     | family lounge      | ICU 4C04-06 |
  26

  Each wing takes three letters for its rooms: level 4's first wing has
  4A01, 4B01 and 4C01, the next 4D01, 4E01 and 4F01. That first wing, the
  one the demo opens on, keeps the support-room and equipment ids the case
  study and old links use (FAM, EQP, IVP-01); every other wing prefixes
  them with its code (4D-FAM, IVP-4D-01).
*/

export const WING = { w: 68, d: 26 }
export const STOREY = { wallHeight: 2.7, lowHeight: 1.05 }
export const LEVELS = [1, 2, 3, 4, 5, 6]
/** The wing the demo opens on: level 4, wards 4A and 4B and ICU 4C. */
export const STORY = '4A'

const COLS = 3
const WINGS_PER_LEVEL = 6
const GAP_X = 8
const GAP_Z = 14
/** One level's footprint: the six wings and the streets between them. */
export const PLATE = { w: COLS * WING.w + (COLS - 1) * GAP_X, d: 2 * WING.d + GAP_Z }
// I and O would read as 1 and 0 in a room number.
const LETTERS = 'ABCDEFGHJKLMNPQRST'

export interface Wing {
  code: string
  level: number
  /** Where the wing sits on its level's plate. */
  x: number
  z: number
  rooms: Room[]
  beds: Room[]
  /** The three rooms equipment moves through when it is not with a patient. */
  store: string
  soiled: string
  lobby: string
  /** The two single-room wards and the ICU pod, as the bed board groups them: rooms are the ones whose ids start with the prefix. */
  wards: { label: string; prefix: string }[]
}

const ROOM_W = 4.5
const ICU_W = 14 / 3
const pad = (n: number) => String(n).padStart(2, '0')
export const isBed = (r: Room) => r.kind === 'patient' || r.kind === 'icu'

function makeWing(level: number, index: number): Wing {
  const [a, b, c] = LETTERS.slice(index * 3, index * 3 + 3)
  const code = `${level}${a}`
  const legacy = code === STORY
  const role = (id: string) => (legacy ? id : `${code}-${id}`)
  const x0 = (index % COLS) * (WING.w + GAP_X)
  const z0 = Math.floor(index / COLS) * (WING.d + GAP_Z)
  const rooms: Room[] = []
  const add = (r: Omit<Room, 'level' | 'wing'>) => rooms.push({ ...r, x: x0 + r.x, z: z0 + r.z, level, wing: code })

  for (let i = 0; i < 12; i++) {
    const id = `${level}${a}${pad(i + 1)}`
    add({ id, name: `Patient room ${id}`, kind: 'patient', x: i * ROOM_W, z: 0, w: ROOM_W, d: 7.5, door: { side: 's', at: 3.5, width: 1.3 }, head: 'n' })
  }
  for (let i = 0; i < 10; i++) {
    const id = `${level}${b}${pad(i + 1)}`
    add({ id, name: `Patient room ${id}`, kind: 'patient', x: i * ROOM_W, z: 18.5, w: ROOM_W, d: 7.5, door: { side: 'n', at: 3.5, width: 1.3 }, head: 's' })
  }
  for (let i = 0; i < 3; i++) {
    const north = `${level}${c}${pad(i + 1)}`
    const south = `${level}${c}${pad(i + 4)}`
    add({ id: north, name: `ICU bay ${north}`, kind: 'icu', x: 54 + i * ICU_W, z: 0, w: ICU_W, d: 7.5, door: { side: 's', at: ICU_W / 2, width: 1.6 }, glass: 's', head: 'n' })
    add({ id: south, name: `ICU bay ${south}`, kind: 'icu', x: 54 + i * ICU_W, z: 18.5, w: ICU_W, d: 7.5, door: { side: 'n', at: ICU_W / 2, width: 1.6 }, glass: 'n', head: 's' })
  }

  const core = (id: string, name: string, x: number, w: number, side: 'n' | 's', extra: Partial<Room> = {}) =>
    add({ id: role(id), name, kind: 'support', x, z: 10.5, w, d: 5, door: { side, at: w / 2, width: 1.4 }, ...extra })
  core('LIFT', 'Lift lobby', 0, 8, 'n', { kind: 'core', door: { side: 'n', at: 4, width: 4 } })
  core('CLN', 'Clean utility', 8, 6, 'n')
  core('MED', 'Medication room', 14, 6, 's')
  core('NS', 'Nurse station', 20, 12, 'n', { kind: 'station', low: true, door: { side: 's', at: 6, width: 3 } })
  core('SOIL', 'Soiled utility', 32, 6, 's')
  core('EQP', 'Equipment store', 38, 6, 'n')
  core('STAFF', 'Staff room', 44, 6, 's')
  core('STAIR', 'Stair B', 50, 4, 'n', { kind: 'core' })
  core('ICUS', 'ICU station', 56, 12, 'n', { kind: 'station', low: true, door: { side: 's', at: 6, width: 3 } })
  add({ id: role('FAM'), name: 'Family lounge', kind: 'lounge', x: 45, z: 18.5, w: 9, d: 7.5, door: { side: 'n', at: 4.5, width: 2 } })

  return {
    code,
    level,
    x: x0,
    z: z0,
    rooms,
    beds: rooms.filter(isBed),
    store: role('EQP'),
    soiled: role('SOIL'),
    lobby: role('LIFT'),
    wards: [
      { label: `Ward ${level}${a}`, prefix: `${level}${a}` },
      { label: `Ward ${level}${b}`, prefix: `${level}${b}` },
      { label: 'ICU', prefix: `${level}${c}` },
    ],
  }
}

export const WINGS = LEVELS.flatMap((level) => Array.from({ length: WINGS_PER_LEVEL }, (_, i) => makeWing(level, i)))
export const WING_BY_CODE: Record<string, Wing> = Object.fromEntries(WINGS.map((w) => [w.code, w]))
export const ROOMS = WINGS.flatMap((w) => w.rooms)
export const ROOM_BY_ID: Record<string, Room> = Object.fromEntries(ROOMS.map((r) => [r.id, r]))
export const BED_ROOMS = ROOMS.filter(isBed)

/** The wing a piece of equipment belongs to, read from its tag: IVP-4D-07 is 4D's, and the story wing keeps IVP-07. */
export function wingOfAsset(id: string) {
  const m = /^[A-Z]{3}-(\d[A-Z])-\d{2}$/.exec(id)
  return m ? m[1] : /^[A-Z]{3}-\d{2}$/.test(id) ? STORY : undefined
}

/* ---------- Circulation: where people walk ---------- */

/** A wing's two corridors, by the z of their north edge in the wing's own coordinates. */
export const CORRIDORS = [7.5, 15.5]
export const CORRIDOR_W = 3
/** The gap in the core, between the stair and the ICU station, where the two corridors meet. */
export const CROSSING_X = 55

/**
  The glazed links of every level. Between neighbouring wings in a row, one
  runs along each corridor; in each street between columns, one runs from
  the north row's corridor B to the south row's corridor A, so the two rows
  meet without the lifts. `x` and `z` are the link's north-west corner.
*/
export interface Link {
  level: number
  x: number
  z: number
  length: number
  axis: 'x' | 'z'
}

export const LINKS: Link[] = WINGS.flatMap((w) => {
  const next = WINGS.filter((o) => o.level === w.level && o.z === w.z && o.x > w.x).sort((a, b) => a.x - b.x)[0]
  if (!next) return []
  const gap = next.x - (w.x + WING.w)
  const along = CORRIDORS.map((dz): Link => ({ level: w.level, x: w.x + WING.w, z: w.z + dz, length: gap, axis: 'x' }))
  if (w.z !== 0) return along
  // A north-row wing also starts the street link down to the south row.
  const south = WINGS.find((o) => o.level === w.level && o.x === w.x && o.z > w.z)!
  const top = w.z + CORRIDORS[1] + CORRIDOR_W
  const across: Link = { level: w.level, x: w.x + WING.w + (gap - CORRIDOR_W) / 2, z: top, length: south.z + CORRIDORS[0] - top, axis: 'z' }
  return [...along, across]
})

/** "Level 4, A wing": how a person names a wing. */
export const wingName = (w: Wing) => `Level ${w.level}, ${w.code.slice(1)} wing`

export const center = (r: Room) => ({ x: r.x + r.w / 2, z: r.z + r.d / 2 })

/** Bed position and heading: the head of the bed against the outside wall. */
export function bedPose(r: Room) {
  const c = center(r)
  const off = r.d / 2 - 1.35
  if (r.head === 'n') return { x: c.x, z: c.z - off, rot: 0 }
  return { x: c.x, z: c.z + off, rot: Math.PI }
}

/** Where the n-th of `count` pieces of equipment in a room stands. */
export function slotPosition(r: Room, slot: number, count = 1): { x: number; z: number } {
  if (isBed(r)) {
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
  // Storage and lobbies: rows from the back wall, packed tighter when a store fills up.
  let step = 0.85
  const cols = () => Math.max(1, Math.floor((r.w - 1) / step))
  while (step > 0.45 && cols() * (Math.floor((r.d - 1) / (step * 1.12)) + 1) < count) step -= 0.05
  const n = cols()
  return { x: r.x + 0.9 + (slot % n) * step, z: r.z + 0.9 + Math.floor(slot / n) * step * 1.12 }
}
