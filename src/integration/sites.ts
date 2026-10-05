import type { Building } from '../data/building'
import { ROOM_BY_ID } from '../data/floorplan'
import { ROOT } from './topics'

/*
  The buildings the integration server can serve. Each is a site: the root
  its systems publish under, the rooms it knows, and which rules apply to
  it. A server serves one site, with a feed of its own, so a screen on the
  clinic never receives the hospital's day.
*/
export interface Site {
  /** A short name, for logs and the MQTT client id. */
  name: string
  /** The topic root its systems publish under (topics.ts). */
  root: string
  /** Every room the site knows; a message about any other is dropped. */
  rooms: ReadonlySet<string>
  /**
    Whether a bed left waiting for cleaning, or a clean one left empty, is an alert. It is a ward's
    question: in a clinic an empty exam room is an ordinary thing, and its turnover shows on the floor.
  */
  turnover: boolean
}

export const HOSPITAL_SITE: Site = { name: 'hospital', root: ROOT, rooms: new Set(Object.keys(ROOM_BY_ID)), turnover: true }

/** The clinic read from its BIM model (public/buildings/clinic.json). */
export const clinicSite = (building: Building): Site => ({ name: 'clinic', root: `${ROOT}/clinic`, rooms: new Set(building.spaces.map((s) => s.id)), turnover: false })
