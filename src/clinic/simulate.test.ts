import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Building } from '../data/building'
import { activeAlerts, activeCall, bedAt } from '../lib/query'
import { DAY_MIN, SAMPLES } from '../sim/time'
import { simulateClinic } from './simulate'

const clinic: Building = JSON.parse(readFileSync('public/buildings/clinic.json', 'utf8'))
const day = simulateClinic(clinic)
const at = (h: number, m = 0) => h * 60 + m

describe('the clinic’s simulated day', () => {
  it('is the same day every time from the same seed, and another from another', () => {
    expect(JSON.stringify(simulateClinic(clinic))).toBe(JSON.stringify(day))
    expect(JSON.stringify(simulateClinic(clinic, 7))).not.toBe(JSON.stringify(day))
  })

  it('reads every room of the plan through the day, and only its rooms', () => {
    expect(Object.keys(day.rooms).sort()).toEqual(clinic.spaces.map((s) => s.id).sort())
    for (const r of Object.values(day.rooms)) {
      expect(r.temp).toHaveLength(SAMPLES)
      expect(r.co2).toHaveLength(SAMPLES)
    }
  })

  it('accounts for every minute of every care room, and sees patients only while the clinic is open', () => {
    for (const s of clinic.spaces) {
      const spans = day.rooms[s.id].spans
      if (s.kind !== 'care') {
        expect(spans, s.id).toEqual([])
        continue
      }
      expect(spans[0].from, s.id).toBe(0)
      expect(spans.at(-1)!.to, s.id).toBe(DAY_MIN)
      for (let i = 1; i < spans.length; i++) expect(spans[i].from, s.id).toBe(spans[i - 1].to)
      for (const v of spans.filter((x) => x.state === 'occupied')) {
        expect(v.from).toBeGreaterThanOrEqual(at(7, 30))
        expect(v.from).toBeLessThan(at(18))
      }
    }
  })

  it('rings call lights only in care rooms with a patient in', () => {
    const care = new Set(clinic.spaces.filter((s) => s.kind === 'care').map((s) => s.id))
    for (const c of day.calls) {
      expect(care.has(c.room), c.room).toBe(true)
      expect(bedAt(day, c.room, c.at)?.state, `${c.room} ${c.at}`).toBe('occupied')
    }
  })

  it('has the afternoon its overview tells: the X-ray room warm, stale air in the waiting rooms, a call left waiting', () => {
    const late = day.calls.find((c) => c.at === at(14, 21) && c.wait === 11.5)!
    expect(activeCall(day, late.room, at(14, 30))).toBe(late)
    const open = activeAlerts(day, at(14, 30)).map((a) => `${a.kind} ${a.target.id}`)
    expect(open).toContain('temp 2A12')
    expect(open).toContain(`call ${late.room}`)
    expect(day.alerts.filter((a) => a.kind === 'co2').map((a) => a.target.id)).toEqual(expect.arrayContaining(['1AC1', '1DC1']))
    // The room is fixed late in the afternoon, and the clinic is quiet by night.
    expect(activeAlerts(day, at(20)).filter((a) => a.target.id === '2A12')).toEqual([])
    expect(activeAlerts(day, at(3))).toEqual([])
  })
})
