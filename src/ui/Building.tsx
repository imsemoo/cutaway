import { Building2 } from 'lucide-react'
import { LEVELS, WINGS } from '../data/floorplan'
import { plural, say } from '../i18n'
import { wingName } from '../lib/query'
import { HOSPITAL, levelScope, scopeLevel } from '../state/scope'
import { useWard } from '../state/store'
import { wingSummaries } from './summary'

/**
  The tower at a glance, and the way between its wings: every wing by
  level, shaded by how full it is, with a mark where something critical is
  open. The panel and the list view offer the same moves to the keyboard,
  so the cells stay out of the tab order and the one button to the whole
  hospital stays in it.
*/
export function Building() {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const scope = useWard((s) => s.scope)
  const view = useWard((s) => s.view)
  const setScope = useWard((s) => s.setScope)
  // Until every wing's day is in, the cells stay blank rather than read as empty wards.
  const complete = useWard((s) => s.complete)
  if (view === 'list') return null
  const summaries = day && complete ? wingSummaries(day, t) : undefined

  return (
    <nav className="building" aria-label={say('Wings of the hospital')}>
      <button className="building__all" aria-pressed={scope === HOSPITAL} onClick={() => setScope(HOSPITAL)}>
        <Building2 size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>{say('All levels')}</span>
      </button>
      {/* A map of the building: the A wing stays west, in either language. */}
      <div className="building__grid" dir="ltr">
        {[...LEVELS].reverse().map((level) => (
          <div key={level} className={`building__level${scopeLevel(scope) === level ? ' is-here' : ''}`}>
            <button
              className="building__n num"
              tabIndex={-1}
              onClick={() => setScope(levelScope(level))}
              aria-label={say('Level {level}', { level })}
              title={say('Level {level}: all six wings', { level })}
            >
              {level}
            </button>
            {WINGS.filter((w) => w.level === level).map((w) => {
              const s = summaries?.get(w.code)
              return (
                <button
                  key={w.code}
                  tabIndex={-1}
                  className={`building__cell${scope === w.code ? ' is-here' : ''}${s?.critical ? ' is-critical' : ''}`}
                  style={{ ['--full' as string]: s ? (s.occupied / s.beds).toFixed(2) : 0 }}
                  onClick={() => setScope(w.code)}
                  aria-label={
                    s
                      ? say(s.critical ? '{wing}: {occupied} of {beds} beds occupied, something critical open' : '{wing}: {occupied} of {beds} beds occupied', {
                          wing: wingName(w),
                          occupied: s.occupied,
                          beds: s.beds,
                        })
                      : wingName(w)
                  }
                  title={
                    s
                      ? say('{wing} · {occupied} of {beds} occupied · {alerts}', {
                          wing: wingName(w),
                          occupied: s.occupied,
                          beds: s.beds,
                          alerts: plural(s.alerts, '{n} alert', '{n} alerts'),
                        })
                      : wingName(w)
                  }
                />
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}
