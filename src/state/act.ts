import type { AlertAction, Team } from '../data/types'
import type { Outgoing } from '../live/feed'
import { useWard } from './store'

/*
  What an operator does about an alert. It lives apart from the store, with
  the alert list that calls it, so the interface's first paint does not
  carry it.
*/

let count = 0

/**
  Acknowledges an alert or sends it to a team. In replay it joins the day at the minute on
  show; live, it goes through the feed, and the server's clock stamps it.
*/
export function act(alert: string, what: AlertAction['act'], team?: Team) {
  const s = useWard.getState()
  const live = s.mode === 'live'
  const action: Outgoing = { id: `${s.screen}-${++count}`, alert, act: what, ...(team && { team }), ...(live && { by: s.screen }) }
  if (live) return s.send?.(action)
  if (!s.day) return
  const day = { ...s.day, actions: [...s.day.actions, { ...action, at: s.t }] }
  useWard.setState({ day, recorded: day })
}
