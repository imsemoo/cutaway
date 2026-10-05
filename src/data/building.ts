/*
  A building imported from a BIM model (tools/ifc), as Cutaway draws it:
  its storeys, its rooms as floor outlines with their numbers, names and
  categories, its walls as footprints with the door openings left in them,
  and its doors with the rooms each one joins. Metres, x east and z south,
  the building's corner at the origin.
*/

export type Pt = [number, number]

/** What a room is for, as the twin treats it. Care rooms turn over between patients. */
export type SpaceKind = 'care' | 'waiting' | 'circulation' | 'staff' | 'support'

export interface BuildingSpace {
  /** The room number, as the drawings give it: 1C18. */
  id: string
  /** Its name, as the drawings give it: PHYSICAL EXAM. */
  name: string
  /** Its OmniClass Table 13 category: 13-41 41 14 Physical Examination Room. */
  category: string
  kind: SpaceKind
  storey: number
  /** m², as the model states it. */
  area: number
  outline: Pt[]
  /** Where its label goes: inside it, as far from its walls as it gets. */
  label: Pt
}

export interface Building {
  name: string
  /** Where the model came from, its licence, and what the import changed. */
  source: { title: string; credit: string; url: string; license: string; sha256: string; changes: string }
  storeys: { name: string; elevation: number; height: number }[]
  spaces: BuildingSpace[]
  walls: { storey: number; outline: Pt[] }[]
  doors: { storey: number; at: Pt; width: number; spaces: string[] }[]
  /** The plan's extent. */
  size: { w: number; d: number }
}
