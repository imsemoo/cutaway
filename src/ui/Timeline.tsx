import { History, Pause, Play, Radio } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { plural, say } from '../i18n'
import { alertTitle } from '../lib/alerts'
import { SEVERITY } from '../lib/colors'
import { alertWing, clock } from '../lib/query'
import { HOSPITAL, scopeWings } from '../state/scope'
import { SPEEDS, useWard, type Mode } from '../state/store'

const MODES: { id: Mode; label: string; icon: typeof Play }[] = [
  { id: 'replay', label: 'Replay', icon: History },
  { id: 'live', label: 'Live', icon: Radio },
]

export function Timeline() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const playing = useWard((s) => s.playing)
  const speed = useWard((s) => s.speed)
  const mode = useWard((s) => s.mode)
  const scope = useWard((s) => s.scope)
  const setT = useWard((s) => s.setT)
  const setPlaying = useWard((s) => s.setPlaying)
  const setSpeed = useWard((s) => s.setSpeed)
  const setMode = useWard((s) => s.setMode)
  const live = mode === 'live'

  // A wing or a level marks all of its alerts; the whole hospital, only the critical ones, or the rail would be solid.
  const marks = useMemo(() => {
    const on = new Set(scopeWings(scope).map((w) => w.code))
    return (day?.alerts ?? [])
      .filter((a) => (scope === HOSPITAL ? a.severity === 'critical' : on.has(alertWing(a) ?? '')))
      .map((a) => ({ id: a.id, at: a.from, color: SEVERITY[a.severity], title: `${clock(a.from)} ${alertTitle(a)} ${a.target.id}` }))
  }, [day, scope])

  // Playback controls keep time running left to right in either language, as media players do.
  return (
    <footer className="timeline" data-mode={mode} dir="ltr">
      {live ? (
        <FeedDot />
      ) : (
        <button
          className="play"
          onClick={() => {
            if (!playing && t >= 1435) setT(0)
            setPlaying(!playing)
          }}
          aria-label={playing ? say('Pause the replay') : say('Play the day')}
          disabled={!day}
        >
          {playing ? <Pause size={18} strokeWidth={2} aria-hidden="true" /> : <Play size={18} strokeWidth={2} aria-hidden="true" />}
        </button>
      )}
      <output className="clock num" aria-live="off">
        {clock(t)}
      </output>
      <div className="track">
        <div className="track__hours" aria-hidden="true">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
        <div className="track__rail" aria-hidden="true">
          <span className="track__fill" style={{ width: `${(t / 1440) * 100}%` }} />
          {marks.map((m) => (
            <i key={m.id} className="track__mark" style={{ left: `${(m.at / 1440) * 100}%`, background: m.color }} title={m.title} />
          ))}
        </div>
        <input
          className="track__input"
          type="range"
          min={0}
          max={1439}
          step={5}
          value={Math.round(t)}
          onChange={(e) => {
            setPlaying(false)
            setT(Number(e.target.value))
          }}
          aria-label={say('Time of day')}
          aria-valuetext={live ? say('{time}, live', { time: clock(t) }) : clock(t)}
          disabled={!day || live}
        />
      </div>
      <div className="timeline__end">
        {live ? (
          <FeedState />
        ) : (
          <div className="seg seg--small" role="radiogroup" aria-label={say('Replay speed')}>
            {SPEEDS.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={speed === s}
                className="seg__btn"
                onClick={() => setSpeed(s)}
                aria-label={plural(s, '{n} simulated minute per second', '{n} simulated minutes per second')}
              >
                <span className="num">{s === 60 ? say('1 h/s') : say('{n} min/s', { n: s })}</span>
              </button>
            ))}
          </div>
        )}
        <div className="seg seg--small seg--mode" role="radiogroup" aria-label={say('Data')}>
          {MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={mode === id} aria-label={say(label)} title={say(label)} className="seg__btn" onClick={() => setMode(id)}>
              <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{say(label)}</span>
            </button>
          ))}
        </div>
      </div>
    </footer>
  )
}

/** Where the play button stands in replay: the state of the connection at a glance. */
function FeedDot() {
  // Between attempts and during one, it is the same outage: amber throughout.
  const state = useWard((s) => (s.feed.state === 'connecting' && s.feed.attempt > 0 ? 'retrying' : s.feed.state))
  return <span className="feed-dot" data-state={state} aria-hidden="true" />
}

function FeedState() {
  const feed = useWard((s) => s.feed)
  const [, redraw] = useState(0)
  // Count down to the next attempt. Only the change of state is announced, not every second of it.
  useEffect(() => {
    if (feed.state !== 'retrying') return
    const id = setInterval(() => redraw((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [feed])

  let said = ''
  let countdown = ''
  if (feed.state === 'connecting') said = feed.attempt ? say('Reconnecting…') : say('Connecting…')
  else if (feed.state === 'live')
    said = feed.caughtUp === undefined ? say('Live') : plural(feed.caughtUp, 'Live, {n} missed event replayed', 'Live, {n} missed events replayed')
  else if (feed.state === 'retrying') {
    said = say('Offline, retry {n}', { n: feed.attempt })
    countdown = say('in {n} s', { n: Math.max(1, Math.ceil((feed.at - Date.now()) / 1000)) })
  }
  return (
    <p className="feed" data-state={feed.state} title={countdown ? `${said} ${countdown}` : said}>
      <span role="status">{said}</span>
      {countdown && <span aria-hidden="true"> {countdown}</span>}
    </p>
  )
}
