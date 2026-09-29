import { LEVELS, WINGS, WING_BY_CODE, type Wing } from '../data/floorplan'

/*
  What the model shows: the whole hospital, one level with its six wings,
  or one wing. In the store a scope is 'all', 'L4' or a wing's code such as
  '4D'; a link writes it as at=hospital, at=level-4 or at=4d.
*/
export type Scope = string

export const HOSPITAL: Scope = 'all'
export const levelScope = (level: number): Scope => `L${level}`

/** The level a scope shows on its own, when it is a level. */
export const scopeLevel = (scope: Scope) => (/^L\d$/.test(scope) ? Number(scope.slice(1)) : undefined)
export const isWing = (scope: Scope) => scope in WING_BY_CODE

/** The wings a scope shows. */
export function scopeWings(scope: Scope): Wing[] {
  if (scope === HOSPITAL) return WINGS
  const level = scopeLevel(scope)
  return level ? WINGS.filter((w) => w.level === level) : [WING_BY_CODE[scope]]
}

/** Whether a wing is drawn in this scope. */
export const shows = (scope: Scope, wing: string) => scope === HOSPITAL || scope === wing || scopeLevel(scope) === WING_BY_CODE[wing]?.level

export function scopeToParam(scope: Scope) {
  const level = scopeLevel(scope)
  return scope === HOSPITAL ? 'hospital' : level ? `level-${level}` : scope.toLowerCase()
}

export function scopeFromParam(param: string): Scope | undefined {
  const p = param.toLowerCase()
  if (p === 'hospital') return HOSPITAL
  const level = /^level-(\d)$/.exec(p)
  if (level) return LEVELS.includes(Number(level[1])) ? levelScope(Number(level[1])) : undefined
  return WING_BY_CODE[p.toUpperCase()] ? p.toUpperCase() : undefined
}
