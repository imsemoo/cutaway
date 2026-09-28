import { Pause, Play } from 'lucide-react'
import { useMemo } from 'react'
import { SEVERITY } from '../lib/colors'
import { clock } from '../lib/query'
import { SPEEDS, useWard } from '../state/store'

export function Timeline() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const playing = useWard((s) => s.playing)
  const speed = useWard((s) => s.speed)
  const setT = useWard((s) => s.setT)
  const setPlaying = useWard((s) => s.setPlaying)
  const setSpeed = useWard((s) => s.setSpeed)

  const marks = useMemo(() => (day ? day.alerts.map((a) => ({ id: a.id, at: a.from, color: SEVERITY[a.severity], title: `${clock(a.from)} ${a.title}` })) : []), [day])

  return (
    <footer className="timeline">
      <button
        className="play"
        onClick={() => {
          if (!playing && t >= 1435) setT(0)
          setPlaying(!playing)
        }}
        aria-label={playing ? 'Pause the replay' : 'Play the day'}
        disabled={!day}
      >
        {playing ? <Pause size={18} strokeWidth={2} aria-hidden="true" /> : <Play size={18} strokeWidth={2} aria-hidden="true" />}
      </button>
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
          aria-label="Time of day"
          aria-valuetext={clock(t)}
          disabled={!day}
        />
      </div>
      <div className="seg seg--small" role="radiogroup" aria-label="Replay speed">
        {SPEEDS.map((s) => (
          <button key={s} role="radio" aria-checked={speed === s} className="seg__btn" onClick={() => setSpeed(s)} aria-label={`${s} simulated minutes per second`}>
            <span className="num">{s === 60 ? '1 h' : `${s} min`}/s</span>
          </button>
        ))}
      </div>
    </footer>
  )
}
