import { Check, Info, OctagonAlert, Send, TriangleAlert } from 'lucide-react'
import type { Alert, AlertAction, Day, Selection, Severity } from '../data/types'
import { say } from '../i18n'
import { alertTitle, describe, severityAt } from '../lib/alerts'
import { SEVERITY } from '../lib/colors'
import { OWNER, alertLog, handlingAt, teamLabel, type Step } from '../lib/handling'
import { alertWing, clock, duration } from '../lib/query'
import { act } from '../state/act'
import { useWard } from '../state/store'

/*
  The alerts in the panel, and what an operator does about them. Loaded
  after the first paint: alerts need the day, which arrives later anyway.
*/

const SEV_ICON: Record<Severity, typeof Info> = { critical: OctagonAlert, warning: TriangleAlert, info: Info }

/** The alerts open at minute t, each with a way to acknowledge it and send it on. */
export function AlertList({ alerts, day, t, named, onPick }: { alerts: Alert[]; day: Day; t: number; named?: boolean; onPick?: (s: Selection) => void }) {
  return (
    <ul className={`alerts${onPick ? '' : ' alerts--tight'}`}>
      {alerts.map((a) => (
        <AlertItem key={a.id} alert={a} day={day} t={t} named={named} onPick={onPick && (() => onPick(a.target))} />
      ))}
    </ul>
  )
}

function AlertItem({ alert, day, t, onPick, named }: { alert: Alert; day: Day; t: number; onPick?: () => void; named?: boolean }) {
  const severity = severityAt(alert, day, t)
  const Icon = SEV_ICON[severity]
  // Across the hospital, name the wing; the story wing's support rooms and equipment keep short ids that do not.
  const wing = alertWing(alert)
  const where = named && wing && !alert.target.id.includes(wing) ? `${alert.target.id} · ${wing}` : alert.target.id
  const body = (
    <>
      <Icon className="alert__icon" size={16} strokeWidth={2} style={{ color: SEVERITY[severity] }} aria-label={say(severity)} />
      <span className="alert__body">
        <span className="alert__title">
          {alertTitle(alert)} <span className="alert__where num">{where}</span>
        </span>
        <span className="alert__detail">{describe(alert, day, t)}</span>
      </span>
      <span className="alert__age num" aria-label={say('flagged at {time}', { time: clock(alert.from) })}>
        {clock(alert.from)}
      </span>
    </>
  )
  return (
    <li className="alert-item">
      {onPick ? (
        <button className="alert" onClick={onPick}>
          {body}
        </button>
      ) : (
        <div className="alert alert--static">{body}</div>
      )}
      <Handle alert={alert} day={day} t={t} name={`${alertTitle(alert)}, ${alert.target.id}`} />
    </li>
  )
}

/**
  Where focus goes once an action lands: the button it was on is gone by then, so the next
  step takes it, and after the last step the alert's new standing does. Live, that is when the
  server's echo arrives, so it is held until then.
*/
let focusNext: { alert: string; on: 'send' | 'standing' } | null = null
const takeFocus = (alert: string, on: 'send' | 'standing') => (el: HTMLElement | null) => {
  if (!el || focusNext?.alert !== alert || focusNext.on !== on) return
  focusNext = null
  el.focus()
}

/** Where an alert stands with the operators, and the next thing to do about it. */
function Handle({ alert, day, t, name }: { alert: Alert; day: Day; t: number; name: string }) {
  const waiting = useWard((s) => s.pending.some((p) => p.alert === alert.id))
  const up = useWard((s) => s.feed.state === 'live')
  const screen = useWard((s) => s.screen)
  const { ack, sent } = handlingAt(day, alert.id, t)
  const team = OWNER[alert.kind]
  if (waiting) {
    return (
      <p className="handle" role="status">
        {up ? say('Sending…') : say('Waiting for the connection to send')}
      </p>
    )
  }
  if (!ack) {
    return (
      <p className="handle">
        <button
          className="btn btn--quiet btn--small"
          onClick={() => {
            focusNext = { alert: alert.id, on: 'send' }
            act(alert.id, 'ack')
          }}
          aria-label={say('Acknowledge: {alert}', { alert: name })}
        >
          <Check size={14} strokeWidth={2} aria-hidden="true" /> {say('Acknowledge')}
        </button>
      </p>
    )
  }
  return (
    <p className="handle" tabIndex={-1} ref={sent ? takeFocus(alert.id, 'standing') : undefined}>
      <span>
        {acknowledged(ack, screen)}
        {sent && ` · ${say('With {team} since {time}', { team: teamLabel(sent.team ?? team), time: clock(sent.at) })}`}
      </span>
      {!sent && (
        <button
          ref={takeFocus(alert.id, 'send')}
          className="btn btn--quiet btn--small"
          onClick={() => {
            focusNext = { alert: alert.id, on: 'standing' }
            act(alert.id, 'send', team)
          }}
          aria-label={say('Send to {team}: {alert}', { team: teamLabel(team), alert: name })}
        >
          <Send size={14} strokeWidth={2} aria-hidden="true" /> {say('Send to {team}', { team: teamLabel(team) })}
        </button>
      )}
    </p>
  )
}

/** "Acknowledged 14:31", and on a live feed, whether that was on another screen. */
const acknowledged = (ack: AlertAction, screen: string) =>
  ack.by && ack.by !== screen ? say('Acknowledged {time} on another screen', { time: clock(ack.at) }) : say('Acknowledged {time}', { time: clock(ack.at) })

/** The alerts a room or a piece of equipment has had today by minute t, newest first, each with its log. */
export function AlertHistory({ day, t, target }: { day: Day; t: number; target: Selection }) {
  const screen = useWard((s) => s.screen)
  const past = day.alerts.filter((a) => a.target.type === target.type && a.target.id === target.id && a.from <= t).reverse()
  if (past.length === 0) return null
  const said = (s: Step, a: Alert) => {
    switch (s.what) {
      case 'opened':
        return say('Opened')
      case 'acknowledged':
        return s.by && s.by !== screen
          ? say('Acknowledged on another screen, {wait} after it opened', { wait: duration(s.at - a.from) })
          : say('Acknowledged, {wait} after it opened', { wait: duration(s.at - a.from) })
      case 'sent':
        return say('Sent to {team}', { team: teamLabel(s.team ?? OWNER[a.kind]) })
      case 'cleared':
        // One that cleared before anyone saw it is the case alarm reviews look for.
        return handlingAt(day, a.id, t).ack
          ? say('Cleared, after {wait}', { wait: duration(s.at - a.from) })
          : say('Cleared after {wait}, never acknowledged', { wait: duration(s.at - a.from) })
    }
  }
  return (
    <section className="section">
      <h2 className="h2">{say('Alerts today')}</h2>
      <ol className="history">
        {past.map((a) => (
          <li key={a.id} className="history__alert">
            <span className="history__title">{alertTitle(a)}</span>
            <ol className="moves">
              {alertLog(day, a, t).map((s) => (
                <li key={s.what} className="moves__item">
                  <span className="num moves__time">{clock(s.at)}</span>
                  <span>{said(s, a)}</span>
                </li>
              ))}
              {a.to > t && !handlingAt(day, a.id, t).ack && (
                <li className="moves__item">
                  <span className="num moves__time">{clock(t)}</span>
                  <span className="muted">{say('Not acknowledged yet')}</span>
                </li>
              )}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  )
}
