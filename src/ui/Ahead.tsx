import { useDeferredValue, useId, useMemo } from 'react'
import type { Day } from '../data/types'
import { plural, say } from '../i18n'
import { HORIZON, STRIDE, balanceAt, outlook, pendingPlan } from '../lib/forecast'
import { clock, duration } from '../lib/query'
import { DAY_MIN } from '../sim/time'
import { scopeWings, type Scope } from '../state/scope'
import { useWard } from '../state/store'

/*
  The next four hours of ward beds, for the hospital, a level or a wing, and
  a room's planned discharge. Loaded after the first paint, with the
  forecast it runs.
*/

/** A balance in words: beds to spare, none, or patients without a bed. */
const balance = (n: number) =>
  n > 0 ? plural(n, '{n} bed to spare', '{n} beds to spare') : n === 0 ? say('no bed to spare') : plural(-n, '{n} patient without a bed', '{n} patients without a bed')

/** What the range says, in a sentence: the likeliest balance, and where it lands four times in five. */
function verdict({ at, low, mid, high }: { at: number; low: number; mid: number; high: number }) {
  const vars = { time: clock(at), mid: balance(mid) }
  if (low === high) return say('By {time}: {mid}.', vars)
  if (low >= 0) return say('By {time}: most likely {mid}, and from {low} to {high} four times in five.', { ...vars, low, high })
  if (high <= 0) return say('By {time}: most likely {mid}, and from {low} to {high} patients four times in five.', { ...vars, low: -high, high: -low })
  return say('By {time}: most likely {mid}; four times in five, anywhere from {low} to {high}.', { ...vars, low: balance(low), high: balance(high) })
}

export default function Ahead({ day, scope }: { day: Day; scope: Scope }) {
  const t = useWard((s) => s.t)
  const replay = useWard((s) => s.mode === 'replay')
  // While the day plays, the forecast may follow a frame behind rather than hold one up.
  const at = useDeferredValue(Math.floor(t))
  const wings = useMemo(() => scopeWings(scope), [scope])
  const o = useMemo(() => outlook(day, at, wings), [day, at, wings])
  const chart = useMemo(() => {
    const past: { at: number; v: number }[] = []
    for (let m = at - HORIZON; m <= at; m += STRIDE) if (m >= 0) past.push({ at: m, v: balanceAt(day, m, wings) })
    // A live day ends now; the recorded one knows what came next, which the replay may show beside the forecast.
    const recorded = replay ? o.steps.slice(1).map((s) => ({ at: s.at, v: balanceAt(day, s.at, wings) })) : []
    return { past, recorded }
  }, [day, at, wings, o, replay])
  const last = o.steps.at(-1)!

  return (
    <section className="section">
      <h2 className="h2">{say('Ward beds, the next four hours')}</h2>
      <div className="reading">
        <span className="reading__label">{say('Clean and ready now')}</span>
        <span className="reading__value num">{o.ready.toLocaleString('en-US')}</span>
      </div>
      <div className="reading">
        <span className="reading__label">
          {say('Patients waiting for a bed')}
          {o.waiting > 0 && <span className="muted"> · {say('longest {wait}', { wait: duration(o.longest) })}</span>}
        </span>
        <span className="reading__value num">{o.waiting.toLocaleString('en-US')}</span>
      </div>
      <div className="reading">
        <span className="reading__label">{say('Discharges planned, not gone yet')}</span>
        <span className="reading__value num">{o.planned.toLocaleString('en-US')}</span>
      </div>
      {o.steps.length > 1 && (
        <>
          <OutlookChart at={at} steps={o.steps} past={chart.past} recorded={chart.recorded} summary={verdict(last)} />
          <p className="verdict">{verdict(last)}</p>
        </>
      )}
      <p className="small">
        {say('A forecast from the beds being turned over, the discharges planned and the usual pace of admissions, never from later in the day. ICU bays are left out: they admit bay to bay.')}
      </p>
    </section>
  )
}

const W = 320
const H = 72

/** Beds to spare over the last four hours and the next: the past as a line, the forecast as a range, and the recorded day beside it in replay. */
function OutlookChart({
  at,
  steps,
  past,
  recorded,
  summary,
}: {
  at: number
  steps: { at: number; low: number; mid: number; high: number }[]
  past: { at: number; v: number }[]
  recorded: { at: number; v: number }[]
  summary: string
}) {
  const id = useId()
  const values = [0, ...past.map((p) => p.v), ...steps.flatMap((s) => [s.low, s.high]), ...recorded.map((r) => r.v)]
  const lo = Math.min(...values) - 1
  const hi = Math.max(...values) + 1
  const x = (m: number) => ((m - (at - HORIZON)) / (2 * HORIZON)) * W
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  const xy = (m: number, v: number) => `${x(m).toFixed(1)},${y(v).toFixed(1)}`
  // A count holds until it changes, so what was counted is drawn in steps; the forecast's quantiles are joined straight.
  const stepped = (points: { at: number; v: number }[]) => points.map((p, i) => (i ? `H${x(p.at).toFixed(1)}V${y(p.v).toFixed(1)}` : `M${xy(p.at, p.v)}`)).join('')
  const line = (points: { at: number; v: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${xy(p.at, p.v)}`).join('')
  const band = [...steps.map((s) => xy(s.at, s.high)), ...[...steps].reverse().map((s) => xy(s.at, s.low))].join(' ')
  // Every two hours on the clock, inside the day.
  const ticks: number[] = []
  for (let m = Math.ceil((at - HORIZON) / 120) * 120; m <= at + HORIZON; m += 120) if (m >= 0 && m <= DAY_MIN) ticks.push(m)
  return (
    <figure className="chart chart--outlook">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={id} preserveAspectRatio="none">
        <title id={id}>{summary}</title>
        {ticks.map((m) => (
          <line key={m} x1={x(m)} x2={x(m)} y1={0} y2={H} className="chart__grid" />
        ))}
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="chart__limit" />
        <polygon points={band} className="chart__band" />
        {recorded.length > 0 && <path d={stepped([{ at, v: steps[0].mid }, ...recorded])} className="chart__future" />}
        <path d={line(steps.map((s) => ({ at: s.at, v: s.mid })))} className="chart__mid" />
        <path d={stepped(past)} className="chart__past" />
        <line x1={x(at)} x2={x(at)} y1={0} y2={H} className="chart__now" />
      </svg>
      {/* The hours sit outside the drawing, which stretches to the panel's width; text inside it would stretch too. */}
      <div className="chart__hours" aria-hidden="true">
        {ticks.map((m) => {
          const left = (x(m) / W) * 100
          return (
            <span key={m} style={{ left: `${left}%`, translate: left < 6 ? '0' : left > 94 ? '-100%' : '-50%' }}>
              {clock(m)}
            </span>
          )
        })}
      </div>
      <figcaption>
        <ul className="keys keys--chart">
          <li className="keys__item">
            <i className="keys__line keys__line--past" />
            {say('So far')}
          </li>
          <li className="keys__item">
            <i className="keys__swatch keys__swatch--range" />
            {say('Likely range')}
          </li>
          {recorded.length > 0 && (
            <li className="keys__item">
              <i className="keys__line keys__line--recorded" />
              {say('What the recorded day did')}
            </li>
          )}
          <li className="keys__item">
            <i className="keys__line keys__line--zero" />
            {say('No bed to spare')}
          </li>
        </ul>
      </figcaption>
    </figure>
  )
}

/** A room's discharge, while one is planned and the patient has not gone. */
export function RoomPlan({ day, t, room }: { day: Day; t: number; room: string }) {
  const plan = pendingPlan(day, room, t)
  if (!plan) return null
  return (
    <p className="small">
      {plan.eta >= t
        ? say('Expected to go home at about {eta}, as the morning round noted at {at}.', { eta: clock(plan.eta), at: clock(plan.at) })
        : say('Was expected to go home at about {eta}, as the morning round noted at {at}, and has not gone yet.', { eta: clock(plan.eta), at: clock(plan.at) })}
    </p>
  )
}
