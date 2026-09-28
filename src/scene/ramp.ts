import { Color } from 'three'

const cold = new Color('#4f86e8')
const mid = new Color('#eef1f4')
const hot = new Color('#e5532b')
const airLow = new Color('#eef1f4')
const airMid = new Color('#b7a4ec')
const airHigh = new Color('#5a33b8')

const lerp3 = (a: Color, b: Color, c: Color, t: number, out: Color) => {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? out.copy(a).lerp(b, x * 2) : out.copy(b).lerp(c, (x - 0.5) * 2)
}

/** 19 °C cold, 22.5 °C neutral, 26.5 °C hot. */
export const tempColor = (c: number, out = new Color()) => lerp3(cold, mid, hot, (c - 19) / 7.5, out)

/** 400 ppm fresh, 1,300 ppm stale. */
export const airColor = (ppm: number, out = new Color()) => lerp3(airLow, airMid, airHigh, (ppm - 420) / 880, out)

