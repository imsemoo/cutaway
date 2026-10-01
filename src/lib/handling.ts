import type { Alert, AlertAction, AlertKind, Day, Team } from '../data/types'
import { say } from '../i18n'

/*
  What operators do about alerts. An alert opens and clears with its
  condition, from the data; an operator acknowledges it and sends it to the
  team that owns it. Acknowledging does not cool a warm room: in alarm
  management (ISA-18.2) clearing belongs to the process, and acknowledging
  to the operator. Actions are part of the day, each at its minute, so how
  an alert stands at minute t knows nothing done after t.
*/

/** The team that owns each kind of alert. */
export const OWNER: Record<AlertKind, Team> = {
  temp: 'facilities',
  co2: 'facilities',
  call: 'nursing',
  dirty: 'housekeeping',
  ready: 'bed-management',
  battery: 'nursing',
}

export const TEAM_LABEL: Record<Team, string> = {
  nursing: 'Nursing',
  housekeeping: 'Housekeeping',
  facilities: 'Facilities',
  'bed-management': 'Bed management',
}
export const teamLabel = (team: Team) => say(TEAM_LABEL[team])

export interface Handling {
  /** The first acknowledgement by minute t. Sending an alert acknowledges it too. */
  ack?: AlertAction
  /** The first time it was sent to a team, by minute t. */
  sent?: AlertAction
}

/** How an alert stands at minute t: what had been done about it by then. */
export function handlingAt(day: Day, id: string, t: number): Handling {
  let ack: AlertAction | undefined
  let sent: AlertAction | undefined
  for (const a of day.actions) {
    if (a.alert !== id || a.at > t) continue
    if (!ack || a.at < ack.at) ack = a
    if (a.act === 'send' && (!sent || a.at < sent.at)) sent = a
  }
  return { ack, sent }
}

export type Step = { at: number; what: 'opened' | 'acknowledged' | 'sent' | 'cleared'; by?: string; team?: Team }

/** An alert's story by minute t: when it opened, was acknowledged, was sent, and cleared, in order. */
export function alertLog(day: Day, alert: Alert, t: number): Step[] {
  const { ack, sent } = handlingAt(day, alert.id, t)
  const steps: Step[] = [{ at: alert.from, what: 'opened' }]
  // A send that came first acknowledged it at the same moment, and says so once.
  if (ack && ack !== sent) steps.push({ at: ack.at, what: 'acknowledged', by: ack.by })
  if (sent) steps.push({ at: sent.at, what: 'sent', by: sent.by, team: sent.team })
  if (alert.to <= t) steps.push({ at: alert.to, what: 'cleared' })
  return steps.sort((a, b) => a.at - b.at)
}
