import { describe, expect, it } from 'vitest'
import { STORY } from '../data/floorplan'
import { HOSPITAL, levelScope } from '../state/scope'
import { nearest, spots, towards } from './cursor'

const RIGHT: [number, number] = [1, 0]
const UP: [number, number] = [0, -1]

describe('the keyboard cursor', () => {
  it('stops on the rooms of a wing, and on the wings of a level or the hospital', () => {
    expect(spots(STORY)).toHaveLength(38)
    expect(spots(levelScope(4))).toHaveLength(6)
    expect(spots(levelScope(4)).every((s) => s.id.startsWith('4'))).toBe(true)
    expect(spots(HOSPITAL)).toHaveLength(36)
  })

  it('steps to the nearest spot that way, keeping to the row', () => {
    const row = [
      { id: 'next', p: [140, 100] as [number, number] },
      { id: 'after', p: [180, 100] as [number, number] },
      { id: 'across', p: [130, 140] as [number, number] },
      { id: 'behind', p: [60, 100] as [number, number] },
    ]
    expect(towards([100, 100], RIGHT, row)).toBe('next')
    // Sideways distance counts double: a room one row over loses to the next one along.
    expect(towards([100, 100], RIGHT, [row[2], row[1]])).toBe('after')
  })

  it('goes nowhere when nothing lies within 60 degrees of the way', () => {
    expect(towards([100, 100], UP, [{ id: 'side', p: [200, 90] }])).toBeUndefined()
    expect(towards([100, 100], RIGHT, [{ id: 'behind', p: [40, 100] }])).toBeUndefined()
  })

  it('starts nearest the point it is given', () => {
    expect(nearest([0, 0], [{ id: 'far', p: [50, 50] }, { id: 'near', p: [5, 5] }])).toBe('near')
  })
})
