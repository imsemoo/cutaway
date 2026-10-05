import type { SpaceKind } from '../data/building'
import { say } from '../i18n'

export const KIND_LABEL: Record<SpaceKind, string> = {
  care: 'Care rooms',
  waiting: 'Waiting and reception',
  circulation: 'Corridors and stairs',
  staff: 'Offices and staff rooms',
  support: 'Support and plant',
}
export const kindLabel = (k: SpaceKind) => say(KIND_LABEL[k])
/** One room's kind, as the list names it. */
export const KIND_ONE: Record<SpaceKind, string> = {
  care: 'Care room',
  waiting: 'Waiting or reception',
  circulation: 'Corridor or stair',
  staff: 'Office or staff room',
  support: 'Support or plant room',
}
/** A floor's name in the language on show. The model's names are American: its first floor is the ground floor. */
export const floorName = (name: string) => say(name)
