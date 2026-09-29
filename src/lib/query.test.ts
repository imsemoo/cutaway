import { describe, expect, it } from 'vitest'
import { BED_ROOMS, LEVELS, ROOMS, ROOM_BY_ID, STORY, WING, WINGS, WING_BY_CODE } from '../data/floorplan'
import { simulate } from '../sim/simulate'
import { describe as word, severityAt } from './alerts'
import { assetPositions } from './positions'
import { assetAt, clock, duration, sample, spanAt } from './query'

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

describe('the hospital plan', () => {
  it('has six levels of six wings: more than a thousand rooms and a thousand beds', () => {
    expect(LEVELS).toHaveLength(6)
    expect(WINGS).toHaveLength(36)
    expect(ROOMS.length).toBeGreaterThan(1000)
    expect(BED_ROOMS.length).toBe(36 * 28)
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(ROOMS.length)
  })

  it('keeps the ids the case study and old links use in the story wing', () => {
    const ids = WING_BY_CODE[STORY].rooms.map((r) => r.id)
    for (const id of ['4A01', '4A09', '4B04', '4C02', 'FAM', 'EQP', 'LIFT']) expect(ids).toContain(id)
    expect(WING_BY_CODE['4D'].rooms.map((r) => r.id)).toContain('4D-FAM')
  })

  it('keeps every room inside its wing', () => {
    for (const r of ROOMS) {
      const w = WING_BY_CODE[r.wing]
      expect(r.level, r.id).toBe(w.level)
      expect(r.x, r.id).toBeGreaterThanOrEqual(w.x)
      expect(r.z, r.id).toBeGreaterThanOrEqual(w.z)
      expect(r.x + r.w, r.id).toBeLessThanOrEqual(w.x + WING.w + 1e-9)
      expect(r.z + r.d, r.id).toBeLessThanOrEqual(w.z + WING.d + 1e-9)
    }
  })

  it('never lets two rooms on a level overlap', () => {
    for (let i = 0; i < ROOMS.length; i++) {
      for (let j = i + 1; j < ROOMS.length; j++) {
        const a = ROOMS[i]
        const b = ROOMS[j]
        if (a.level !== b.level) continue
        const overlap = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.z < b.z + b.d - 1e-9 && b.z < a.z + a.d - 1e-9
        if (overlap) expect.fail(`${a.id} and ${b.id} overlap`)
      }
    }
  })

  it('never stands two pieces of equipment in the same spot', () => {
    const byId = new Map(day.assets.map((a) => [a.id, a]))
    // Clashes are gathered and checked once: an expect per piece, 3,006 pieces at 48 minutes, ran past the timeout under load.
    const clashes: string[] = []
    for (let m = 0; m < 1440; m += 30) {
      const seen = new Set<string>()
      for (const [id, p] of assetPositions(day, m)) {
        const level = ROOM_BY_ID[assetAt(byId.get(id)!, m).loc].level
        const key = `${level}:${p.x.toFixed(2)},${p.z.toFixed(2)}`
        if (seen.has(key)) clashes.push(`${id} at ${key}, minute ${m}`)
        seen.add(key)
      }
    }
    expect(clashes).toEqual([])
  })
})
