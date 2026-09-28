import { describe, expect, it } from 'vitest'
import { FLOOR, ROOMS } from '../data/floorplan'
import { simulate } from '../sim/simulate'
import { describe as word, severityAt } from './alerts'
import { assetPositions } from './positions'
import { clock, duration, sample, spanAt } from './query'

const day = simulate()

describe('formatting', () => {
  it('writes minutes as a 24-hour clock', () => {
    expect(clock(0)).toBe('00:00')
    expect(clock(14 * 60 + 30)).toBe('14:30')
    expect(clock(1439.6)).toBe('00:00')
  })

  it('writes durations the way a person says them', () => {
    expect(duration(9)).toBe('9 min')
    expect(duration(60)).toBe('1 h')
    expect(duration(75)).toBe('1 h 15 min')
  })
})

describe('series and spans', () => {
  it('interpolates between five-minute samples', () => {
    const series = Array.from({ length: 289 }, (_, i) => i)
    expect(sample(series, 0)).toBe(0)
    expect(sample(series, 7.5)).toBeCloseTo(1.5)
    expect(sample(series, 5000)).toBe(288)
  })

  it('finds the span covering a minute, with half-open edges', () => {
    const spans = [
      { from: 0, to: 60 },
      { from: 60, to: 120 },
    ]
    expect(spanAt(spans, 59.9)).toBe(spans[0])
    expect(spanAt(spans, 60)).toBe(spans[1])
    expect(spanAt(spans, 120)).toBe(spans[1])
  })
})

describe('alert wording', () => {
  it('never tells the future: a call reads its wait so far, not the answer', () => {
    for (const a of day.alerts.filter((x) => x.kind === 'call')) {
      const text = word(a, day, a.from)
      expect(text).toContain(clock(a.since))
      expect(text).not.toContain(`${(a.to - a.since).toFixed(1)}`)
      expect(text).toContain('5 min')
    }
  })

  it('never names the minute a dirty bed gets cleaned', () => {
    for (const a of day.alerts.filter((x) => x.kind === 'dirty')) {
      expect(word(a, day, a.from)).not.toContain(clock(a.to))
    }
  })

  it('calls a warm room critical only once it passes 26.5 °C', () => {
    const warm = day.alerts.find((x) => x.kind === 'temp')!
    const series = day.rooms[warm.target.id].temp
    for (let m = warm.from; m < warm.to; m += 5) {
      const now = sample(series, m)
      expect(severityAt(warm, day, m)).toBe(now > 26.5 ? 'critical' : 'warning')
    }
  })
})

describe('the floor plan', () => {
  it('keeps every room inside the building', () => {
    for (const r of ROOMS) {
      expect(r.x, r.id).toBeGreaterThanOrEqual(0)
      expect(r.z, r.id).toBeGreaterThanOrEqual(0)
      expect(r.x + r.w, r.id).toBeLessThanOrEqual(FLOOR.w + 1e-9)
      expect(r.z + r.d, r.id).toBeLessThanOrEqual(FLOOR.d + 1e-9)
    }
  })

  it('never lets two rooms overlap', () => {
    for (let i = 0; i < ROOMS.length; i++) {
      for (let j = i + 1; j < ROOMS.length; j++) {
        const a = ROOMS[i]
        const b = ROOMS[j]
        const overlap = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.z < b.z + b.d - 1e-9 && b.z < a.z + a.d - 1e-9
        expect(overlap, `${a.id} and ${b.id}`).toBe(false)
      }
    }
  })

  it('never stands two pieces of equipment in the same spot', () => {
    for (let m = 0; m < 1440; m += 30) {
      const seen = new Set<string>()
      for (const [id, p] of assetPositions(day, m)) {
        const key = `${p.x.toFixed(2)},${p.z.toFixed(2)}`
        expect(seen.has(key), `${id} at ${key}, minute ${m}`).toBe(false)
        seen.add(key)
      }
    }
  })
})
