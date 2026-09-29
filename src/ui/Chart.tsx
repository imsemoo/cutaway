import { useId } from 'react'
import { say } from '../i18n'
import { DAY_MIN, STEP } from '../sim/time'

interface Props {
  series: number[]
  t: number
  min: number
  max: number
  threshold?: number
  label: string
  format: (v: number) => string
}

const W = 320
const H = 72

/** A 24-hour line with the replay position and an alert threshold. */
export function DayChart({ series, t, min, max, threshold, label, format }: Props) {
  const id = useId()
  const x = (m: number) => (m / DAY_MIN) * W
  const y = (v: number) => H - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * H
  const path = series.map((v, i) => `${i ? 'L' : 'M'}${x(i * STEP).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const upto = series.slice(0, Math.floor(t / STEP) + 1)
  const past = upto.map((v, i) => `${i ? 'L' : 'M'}${x(i * STEP).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const peak = Math.max(...series)
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-labelledby={id} preserveAspectRatio="none">
        <title id={id}>
          {say(threshold === undefined ? '{label} over the day: now {now}, peak {peak}' : '{label} over the day: now {now}, peak {peak}, limit {limit}', {
            label,
            now: format(series[Math.min(series.length - 1, Math.round(t / STEP))]),
            peak: format(peak),
            limit: threshold === undefined ? '' : format(threshold),
          })}
        </title>
        {[0, 6, 12, 18, 24].map((h) => (
          <line key={h} x1={x(h * 60)} x2={x(h * 60)} y1={0} y2={H} className="chart__grid" />
        ))}
        {threshold !== undefined && <line x1={0} x2={W} y1={y(threshold)} y2={y(threshold)} className="chart__limit" />}
        <path d={path} className="chart__future" />
        <path d={past} className="chart__past" />
        <line x1={x(t)} x2={x(t)} y1={0} y2={H} className="chart__now" />
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={Math.min(W - 10, Math.max(6, x(h * 60)))} y={H + 13} className="chart__tick">
            {String(h).padStart(2, '0')}
          </text>
        ))}
      </svg>
    </figure>
  )
}

/** The bed's day as a strip of states, with the replay position. */
export function StateStrip({ parts, t, label }: { parts: { from: number; to: number; color: string; title: string }[]; t: number; label: string }) {
  return (
    <div className="strip" role="img" aria-label={label}>
      {parts.map((p) => (
        <span
          key={p.from}
          className="strip__part"
          title={p.title}
          style={{ left: `${(p.from / DAY_MIN) * 100}%`, width: `${((p.to - p.from) / DAY_MIN) * 100}%`, background: p.color }}
        />
      ))}
      <span className="strip__now" style={{ left: `${(t / DAY_MIN) * 100}%` }} />
    </div>
  )
}
