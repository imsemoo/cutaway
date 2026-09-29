import { WING_BY_CODE } from '../data/floorplan'
import { HOSPITAL, scopeLevel, type Scope } from '../state/scope'

/*
  Where the levels stand. The hospital view draws them apart, an exploded
  section of the building, so every level's floors read at once. Heights
  never change between views: a wing view shows its own wing and hides the
  rest, a level view its six wings, and the camera flies between them.
*/
export const GAP = 40
export const levelY = (level: number) => (level - 1) * GAP


/** The margin of the plate a level's wings stand on in the hospital view. */
export const RIM = 5

/** The height the camera works at: a level's or a wing's floor, or the ground for the whole hospital. */
export const scopeY = (scope: Scope) => (scope === HOSPITAL ? 0 : levelY(scopeLevel(scope) ?? WING_BY_CODE[scope].level))
