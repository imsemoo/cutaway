import type { Alert, Day } from '../data/types'
import { activeAlerts, assetLabel, roomName } from './query'

/*
  Alerts as they open, for the page that embeds the twin and for screen
  readers. Both load after the first paint, so this lives apart from the
  alert wording the panel needs at once.
*/

/** What an alert is about, named: "Patient room 4A09", "Infusion pump IVP-07". */
export function alertPlace(alert: Alert, day: Day) {
  const asset = alert.target.type === 'asset' ? day.assets.find((a) => a.id === alert.target.id) : undefined
  return asset ? `${assetLabel(asset.kind)} ${asset.id}` : roomName(alert.target.id)
}

/** An alert that opens further back than this was skipped over by a jump, not seen opening. */
const STEP = 30

/**
  Watches alerts open as the clock runs forward, playing or live. Each call takes the
  day as it stands and returns the alerts open now and those that opened since the
  last call. A jump, a scrub back, a new mode or the first look opens nothing: they
  change what is open, and no one saw it happen.
*/
export function alertWatch() {
  let seen: { t: number; day: Day | null; mode: string; open: Set<string> } = { t: 0, day: null, mode: '', open: new Set() }
  return ({ day, t, mode, playing }: { day: Day | null; t: number; mode: string; playing: boolean }) => {
    const open = day ? activeAlerts(day, t) : []
    const ran = (playing || mode === 'live') && seen.day !== null && seen.mode === mode && t >= seen.t && t - seen.t <= STEP
    const opened = day && ran ? open.filter((a) => !seen.open.has(a.id) && a.from >= seen.t) : []
    seen = { t, day, mode, open: new Set(open.map((a) => a.id)) }
    return { open, opened }
  }
}
