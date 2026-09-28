import { describe, expect, it } from 'vitest'
import { BED_ROOMS, ROOMS } from '../data/floorplan'
import type { Day } from '../data/types'
import { activeAlerts, assetAt, bedAt, census } from '../lib/query'
import { DEFAULT_TIME } from '../state/store'
import { simulate } from './simulate'
import { DAY_MIN, SAMPLES } from './time'

const day: Day = simulate()

describe('the simulated day', () => {
  it('is the same day for the same seed', () => {
    expect(JSON.stringify(simulate())).toBe(JSON.stringify(day))
  })

  it('changes with the seed', () => {
    expect(JSON.stringify(simulate(7))).not.toBe(JSON.stringify(day))
  })

  it('gives every bed exactly one state at every minute, with no gaps', () => {
    for (const room of BED_ROOMS) {
      const spans = day.rooms[room.id].spans
      expect(spans[0].from, room.id).toBe(0)
      expect(spans[spans.length - 1].to, room.id).toBe(DAY_MIN)
      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].from, `${room.id} span ${i}`).toBe(spans[i - 1].to)
        expect(spans[i].to).toBeGreaterThan(spans[i].from)
      }
    }
  })

  it('turns a vacated bed over in order: dirty, cleaning, ready, occupied', () => {
    const next: Record<string, string[]> = {
      occupied: ['dirty'],
      dirty: ['cleaning'],
      cleaning: ['ready'],
      ready: ['occupied'],
      blocked: [],
    }
    for (const room of BED_ROOMS) {
      const spans = day.rooms[room.id].spans
      for (let i = 1; i < spans.length; i++) {
        expect(next[spans[i - 1].state], `${room.id}: ${spans[i - 1].state} then ${spans[i].state}`).toContain(spans[i].state)
      }
    }
  })

  it('samples every room every five minutes, with readings in a plausible range', () => {
    for (const room of ROOMS) {
      const { temp, co2 } = day.rooms[room.id]
      expect(temp).toHaveLength(SAMPLES)
      expect(co2).toHaveLength(SAMPLES)
      expect(Math.min(...temp)).toBeGreaterThan(18)
      expect(Math.max(...temp)).toBeLessThan(29)
      expect(Math.min(...co2)).toBeGreaterThan(350)
      expect(Math.max(...co2)).toBeLessThan(1600)
    }
  })

  it('keeps every asset somewhere on the floor all day', () => {
    const ids = new Set(ROOMS.map((r) => r.id))
    for (const a of day.assets) {
      expect(a.spans[0].from, a.id).toBe(0)
      expect(a.spans[a.spans.length - 1].to, a.id).toBe(DAY_MIN)
      for (const s of a.spans) expect(ids.has(s.loc), `${a.id} at ${s.loc}`).toBe(true)
    }
  })

  it('only uses equipment in a patient room, and never in an empty bed', () => {
    for (let m = 0; m < DAY_MIN; m += 15) {
      for (const a of day.assets) {
        const s = assetAt(a, m)
        if (s.status !== 'in-use' || a.kind === 'chair') continue
        const bed = bedAt(day, s.loc, m)
        expect(bed, `${a.id} in ${s.loc} at ${m}`).toBeDefined()
      }
    }
  })
})

describe('the story at 14:30, which the case study describes', () => {
  it('opens on the default minute', () => {
    expect(DEFAULT_TIME).toBe(14 * 60 + 30)
  })

  it('has 20 of 28 beds occupied', () => {
    expect(census(day, DEFAULT_TIME)).toEqual({ occupied: 20, ready: 4, cleaning: 1, dirty: 2, blocked: 1 })
  })

  it('has four open alerts: a pump battery, a warm room, a dirty bed and a call light', () => {
    const kinds = activeAlerts(day, DEFAULT_TIME)
      .map((a) => a.kind)
      .sort()
    expect(kinds).toEqual(['battery', 'call', 'dirty', 'temp'])
  })
})

describe('alerts', () => {
  it('open before they close, inside the day', () => {
    for (const a of day.alerts) {
      expect(a.to, a.id).toBeGreaterThan(a.from)
      expect(a.from).toBeGreaterThanOrEqual(0)
      expect(a.to).toBeLessThanOrEqual(DAY_MIN)
      expect(a.since).toBeLessThanOrEqual(a.from)
    }
  })

  it('flag a call light only after five minutes of waiting', () => {
    for (const a of day.alerts.filter((x) => x.kind === 'call')) {
      expect(a.from - a.since).toBe(5)
    }
  })

  it('flag a dirty bed only after an hour', () => {
    for (const a of day.alerts.filter((x) => x.kind === 'dirty')) {
      expect(a.from - a.since).toBe(60)
    }
  })
})
