import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inside } from '../../tools/ifc/outline'
import type { Building, Pt } from './building'

/* The clinic as imported from its IFC file (tools/ifc), checked against what the model itself states. */

const clinic: Building = JSON.parse(readFileSync('public/buildings/clinic.json', 'utf8'))
const area = (l: Pt[]) => Math.abs(l.reduce((s, [x, z], i) => s + x * l[(i + 1) % l.length][1] - l[(i + 1) % l.length][0] * z, 0)) / 2
const perimeter = (l: Pt[]) => l.reduce((s, [x, z], i) => s + Math.hypot(l[(i + 1) % l.length][0] - x, l[(i + 1) % l.length][1] - z), 0)

describe('the imported clinic', () => {
  it('has its two storeys and their rooms, each room once', () => {
    expect(clinic.storeys.map((s) => s.name)).toEqual(['First Floor', 'Second Floor'])
    expect([0, 1].map((i) => clinic.spaces.filter((s) => s.storey === i).length)).toEqual([154, 105])
    expect(new Set(clinic.spaces.map((s) => s.id)).size).toBe(clinic.spaces.length)
  })

  it('draws every room at the area the model states for it, once the walls it is measured to are counted', () => {
    // The model measures a room to the middle of its walls, the outline stops at their faces: half of a 12 cm wall.
    const half = 0.06
    const off = clinic.spaces.map((s) => Math.abs((area(s.outline) + perimeter(s.outline) * half) / s.area - 1))
    expect(Math.max(...off)).toBeLessThan(0.1)
    expect(off.filter((x) => x < 0.05).length / off.length).toBeGreaterThan(0.95)
  })

  it('puts every label inside its room', () => {
    for (const s of clinic.spaces) expect(inside(s.label, s.outline), s.id).toBe(true)
  })

  it('joins rooms that exist, by doors on the same storey', () => {
    const rooms = new Map(clinic.spaces.map((s) => [s.id, s]))
    for (const d of clinic.doors) for (const id of d.spaces) expect(rooms.get(id)?.storey, id).toBe(d.storey)
    expect(clinic.doors.filter((d) => d.spaces.length >= 2).length).toBeGreaterThan(200)
  })

  it('says where it came from, under what licence, and what was changed', () => {
    expect(clinic.source).toMatchObject({ license: 'CC BY 4.0', credit: expect.stringContaining('buildingSMART International'), url: expect.stringContaining('github.com/buildingsmart-community') })
    expect(clinic.source.changes).toContain('simulated')
    expect(clinic.source.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
