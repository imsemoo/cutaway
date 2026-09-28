/*
  The ward's furniture and equipment, modelled as code.

  Each model is a list of parts. A part is a three.js geometry, a base
  colour and a tint flag. Tinted parts take the per-instance colour at
  runtime (a blanket shows the patient's acuity, a pump's housing its
  status); the rest keep their own colour. Units are metres, the origin
  sits on the floor at the model's centre, and the head of a bed faces -z.
*/
import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export const C = {
  steel: 0xb9c1ca,
  chrome: 0xd3d9df,
  dark: 0x39424e,
  rubber: 0x2a3038,
  shell: 0xe9edf1,
  panel: 0xdfe4ea,
  mattress: 0xe3e9f0,
  sheet: 0xf6f8fa,
  pillow: 0xffffff,
  screen: 0x1b2433,
  glow: 0x7fb5ff,
  bag: 0xd8e8f7,
  tube: 0xe8eef5,
  hose: 0x9db1c7,
  wood: 0xc8b49a,
  seat: 0x8f9aa8,
}

const part = (geometry, color, tint = false) => ({ geometry, color, tint })

/** A rounded box, placed by its centre, optionally tilted about its own x axis first. */
function rbox(w, h, d, x, y, z, radius = 0.02, segments = 2, tilt = 0) {
  const r = Math.min(radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)
  return new RoundedBoxGeometry(w, h, d, segments, r).rotateX(tilt).translate(x, y, z)
}

const box = (w, h, d, x, y, z, tilt = 0) => new BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z)

function cyl(r, h, x, y, z, radial = 12, rTop = r) {
  return new CylinderGeometry(rTop, r, h, radial).translate(x, y, z)
}

/** A wheel standing up, axle along x. */
function wheel(r, width, x, y, z) {
  return new CylinderGeometry(r, r, width, 14).rotateZ(Math.PI / 2).translate(x, y, z)
}

/** A caster: a small wheel under a fork, for carts and poles. */
function caster(x, z, r = 0.035) {
  return [part(wheel(r, 0.025, x, r, z), C.rubber), part(box(0.03, 0.05, 0.03, x, r * 2 + 0.02, z), C.dark)]
}

function tube(points, radius, segments = 32) {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)))
  return new TubeGeometry(curve, segments, radius, 6, false)
}

/** A five-legged rolling base, as under an IV pole. */
function starBase(reach = 0.3, y = 0.07) {
  const parts = [part(cyl(0.05, 0.06, 0, y, 0), C.dark)]
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const leg = box(0.035, 0.028, reach, 0, y, reach / 2).rotateY(a)
    parts.push(part(leg, C.dark))
    parts.push(...caster(Math.sin(a) * reach, Math.cos(a) * reach, 0.03))
  }
  return parts
}

/* ---------------- beds ---------------- */

export function bed() {
  const L = 2.1
  return [
    // Base frame, lift columns and casters.
    part(rbox(0.86, 0.1, 1.86, 0, 0.2, 0, 0.03), C.steel),
    part(box(0.08, 0.2, 0.08, 0, 0.33, -0.55), C.dark),
    part(box(0.08, 0.2, 0.08, 0, 0.33, 0.55), C.dark),
    ...caster(-0.38, -0.86, 0.055),
    ...caster(0.38, -0.86, 0.055),
    ...caster(-0.38, 0.86, 0.055),
    ...caster(0.38, 0.86, 0.055),
    // Deck, mattress and the head and foot boards.
    part(rbox(0.94, 0.05, 2.0, 0, 0.45, 0, 0.02), C.panel),
    part(rbox(0.9, 0.15, 1.94, 0, 0.55, 0, 0.06, 3), C.mattress),
    part(rbox(0.98, 0.52, 0.06, 0, 0.66, -L / 2, 0.025), C.shell),
    part(rbox(0.98, 0.34, 0.06, 0, 0.56, L / 2, 0.025), C.shell),
    // Side rails on the head half.
    part(rbox(0.035, 0.18, 0.78, -0.49, 0.72, -0.48, 0.015), C.chrome),
    part(rbox(0.035, 0.18, 0.78, 0.49, 0.72, -0.48, 0.015), C.chrome),
    // Pillow and a folded sheet at the foot.
    part(rbox(0.6, 0.1, 0.34, 0, 0.67, -0.74, 0.045, 3), C.pillow),
    part(rbox(0.86, 0.04, 0.3, 0, 0.64, 0.8, 0.018), C.sheet),
  ]
}

/** A patient under a blanket, shown only when the bed is occupied. The blanket carries the acuity colour. */
export function occupant() {
  return [
    part(rbox(0.92, 0.07, 1.3, 0, 0.66, 0.2, 0.03, 2), C.shell, true),
    part(rbox(0.44, 0.14, 1.12, 0, 0.7, 0.18, 0.07, 3), C.shell, true),
    part(rbox(0.9, 0.035, 0.18, 0, 0.7, -0.44, 0.015), C.sheet),
    part(new SphereGeometry(0.1, 12, 9).scale(1, 0.85, 1.05).translate(0, 0.76, -0.7), 0xd6c4b0),
  ]
}

/** What stands beside every bed: a bedside cabinet, an overbed table and a visitor chair. */
export function roomKit() {
  const chair = (x, z, turn) => {
    const g = [
      part(rbox(0.46, 0.06, 0.44, 0, 0.46, 0, 0.02), C.seat),
      part(rbox(0.46, 0.44, 0.05, 0, 0.72, -0.2, 0.02), C.seat),
      ...[
        [-0.19, -0.18],
        [0.19, -0.18],
        [-0.19, 0.18],
        [0.19, 0.18],
      ].map(([lx, lz]) => part(cyl(0.015, 0.44, lx, 0.22, lz, 8), C.dark)),
    ]
    for (const p of g) p.geometry.rotateY(turn).translate(x, 0, z)
    return g
  }
  return [
    // Bedside cabinet by the head.
    part(rbox(0.46, 0.78, 0.44, -0.92, 0.39, -1.02, 0.025), C.shell),
    part(box(0.42, 0.006, 0.01, -0.92, 0.55, -0.795), C.steel),
    part(rbox(0.12, 0.02, 0.02, -0.92, 0.66, -0.79, 0.008), C.dark),
    part(rbox(0.5, 0.03, 0.48, -0.92, 0.795, -1.02, 0.012), C.wood),
    // Overbed table across the foot.
    part(rbox(0.72, 0.03, 0.38, 0, 0.86, 1.46, 0.015), C.wood),
    part(box(0.05, 0.8, 0.05, 0.3, 0.45, 1.46), C.steel),
    part(rbox(0.1, 0.03, 0.5, 0.3, 0.05, 1.46, 0.012), C.dark),
    // Visitor chair by the window side, turned to the bed.
    ...chair(1.55, -0.2, -Math.PI / 2),
  ]
}

/* ---------------- equipment ---------------- */

export function pump() {
  return [
    ...starBase(0.28),
    part(cyl(0.013, 1.78, 0, 0.98, 0, 10), C.chrome),
    part(box(0.34, 0.012, 0.012, 0, 1.84, 0), C.chrome),
    // An infusion bag and its line down to the pump.
    part(rbox(0.12, 0.21, 0.035, 0.12, 1.7, 0, 0.015), C.bag),
    part(tube([[0.12, 1.59, 0], [0.13, 1.4, 0.04], [0.08, 1.24, 0.09]], 0.004, 20), C.tube),
    // Two pump channels clamped to the pole; the housings show the status.
    part(rbox(0.2, 0.25, 0.13, 0, 1.08, 0.09, 0.025), C.shell, true),
    part(box(0.13, 0.07, 0.004, 0, 1.12, 0.157), C.screen),
    part(rbox(0.2, 0.14, 0.13, 0, 0.87, 0.09, 0.025), C.shell, true),
    part(box(0.1, 0.035, 0.004, 0, 0.88, 0.157), C.screen),
    part(tube([[0.05, 0.8, 0.12], [0.2, 0.7, 0.3], [0.45, 0.72, 0.45]], 0.004, 20), C.tube),
  ]
}

export function vent() {
  return [
    part(rbox(0.56, 0.07, 0.6, 0, 0.12, 0, 0.03), C.dark),
    ...caster(-0.23, -0.25),
    ...caster(0.23, -0.25),
    ...caster(-0.23, 0.25),
    ...caster(0.23, 0.25),
    part(box(0.12, 0.4, 0.12, 0, 0.36, -0.05), C.steel),
    part(rbox(0.48, 0.42, 0.4, 0, 0.78, 0, 0.05, 3), C.shell, true),
    part(box(0.02, 0.26, 0.02, 0, 1.12, -0.12), C.dark),
    part(rbox(0.38, 0.27, 0.035, 0, 1.3, -0.08, 0.02, 2, -0.25), C.dark),
    part(box(0.33, 0.21, 0.005, 0, 1.302, -0.058, -0.25), C.screen),
    // Breathing circuit to the patient.
    part(tube([[0.12, 0.8, 0.2], [0.35, 0.95, 0.5], [0.55, 0.9, 0.85]], 0.018, 24), C.hose),
    part(tube([[-0.05, 0.8, 0.2], [0.25, 1.0, 0.45], [0.5, 0.95, 0.85]], 0.018, 24), C.hose),
  ]
}

export function chair() {
  const g = [
    part(rbox(0.44, 0.05, 0.42, 0, 0.5, 0, 0.02), C.seat, true),
    part(rbox(0.44, 0.42, 0.04, 0, 0.75, -0.22, 0.02, 2, -0.08), C.seat, true),
    part(rbox(0.05, 0.03, 0.34, -0.26, 0.68, -0.02, 0.012), C.dark),
    part(rbox(0.05, 0.03, 0.34, 0.26, 0.68, -0.02, 0.012), C.dark),
    part(box(0.12, 0.02, 0.1, -0.12, 0.14, 0.33), C.dark),
    part(box(0.12, 0.02, 0.1, 0.12, 0.14, 0.33), C.dark),
  ]
  for (const x of [-0.24, 0.24]) {
    g.push(part(cyl(0.012, 0.62, x, 0.5, -0.2, 8), C.steel))
    g.push(part(new TorusGeometry(0.28, 0.022, 6, 24).rotateY(Math.PI / 2).translate(x * 1.18, 0.3, -0.05), C.rubber))
    g.push(part(wheel(0.035, 0.03, x * 1.18, 0.3, -0.05), C.steel))
    g.push(part(wheel(0.07, 0.03, x * 0.85, 0.07, 0.28), C.rubber))
  }
  return g
}

export function xray() {
  return [
    part(rbox(0.6, 0.38, 0.96, 0, 0.3, 0, 0.06, 3), C.shell, true),
    ...caster(-0.24, -0.4, 0.05),
    ...caster(0.24, -0.4, 0.05),
    ...caster(-0.24, 0.4, 0.05),
    ...caster(0.24, 0.4, 0.05),
    part(rbox(0.16, 1.36, 0.16, 0, 1.15, -0.32, 0.03), C.panel),
    part(rbox(0.1, 0.1, 0.92, 0, 1.76, 0.1, 0.025), C.panel),
    part(rbox(0.28, 0.24, 0.3, 0, 1.62, 0.58, 0.04, 3), C.panel),
    part(rbox(0.2, 0.1, 0.2, 0, 1.46, 0.58, 0.02), C.dark),
    part(rbox(0.5, 0.03, 0.03, 0, 0.62, -0.46, 0.012), C.chrome),
  ]
}

export function scanner() {
  return [
    ...starBase(0.22),
    part(cyl(0.014, 0.92, 0, 0.52, 0, 10), C.chrome),
    part(rbox(0.26, 0.2, 0.14, 0, 1.04, 0.02, 0.025), C.shell, true),
    part(box(0.2, 0.13, 0.004, 0, 1.06, 0.092), C.screen),
    part(rbox(0.05, 0.12, 0.05, 0.16, 0.95, 0.03, 0.02), C.panel),
    part(tube([[0.16, 0.89, 0.03], [0.22, 0.75, 0.1], [0.12, 0.92, 0.08]], 0.004, 16), C.tube),
  ]
}

export const MODELS = { bed, occupant, roomKit, pump, vent, chair, xray, scanner }
