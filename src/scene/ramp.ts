import { Color } from 'three'

const cold = new Color('#4f86e8')
const mid = new Color('#eef1f4')
const hot = new Color('#e5532b')
const airLow = new Color('#eef1f4')
const airMid = new Color('#b7a4ec')
const airHigh = new Color('#5a33b8')

/** A reading's ramp: its three colours, the readings at either end, and the alert limit. */
export interface Ramp {
  stops: [Color, Color, Color]
  lo: number
  hi: number
  limit: number
}

/** 19 °C cold, 22.5 °C neutral, 26.5 °C hot; a room is too warm above 25.5 °C. */
export const TEMP: Ramp = { stops: [cold, mid, hot], lo: 19, hi: 26.5, limit: 25.5 }
/** 420 ppm fresh, 1,300 ppm stale; the air is getting stale above 1,000 ppm. */
export const AIR: Ramp = { stops: [airLow, airMid, airHigh], lo: 420, hi: 1300, limit: 1000 }

/** Where a reading falls along its ramp, 0 to 1. */
export const along = (ramp: Ramp, value: number) => Math.max(0, Math.min(1, (value - ramp.lo) / (ramp.hi - ramp.lo)))

const colorAt = ({ stops: [a, b, c] }: Ramp, x: number, out: Color) => (x < 0.5 ? out.copy(a).lerp(b, x * 2) : out.copy(b).lerp(c, (x - 0.5) * 2))

export const tempColor = (c: number, out = new Color()) => colorAt(TEMP, along(TEMP, c), out)
export const airColor = (ppm: number, out = new Color()) => colorAt(AIR, along(AIR, ppm), out)
