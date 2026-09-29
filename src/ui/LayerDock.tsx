import { BedDouble, BellRing, RotateCcw, Thermometer, Wind } from 'lucide-react'
import type { BedState, Layer } from '../data/types'
import { say } from '../i18n'
import { AIR_STOPS, BED, TEMP_STOPS, callColor } from '../lib/colors'
import { bedLabel, census } from '../lib/query'
import { HOSPITAL, scopeWings } from '../state/scope'
import { covers, useWard } from '../state/store'

const LAYERS: { id: Layer; label: string; icon: typeof BedDouble }[] = [
  { id: 'beds', label: 'Beds', icon: BedDouble },
  { id: 'temp', label: 'Temperature', icon: Thermometer },
  { id: 'air', label: 'Air', icon: Wind },
  { id: 'calls', label: 'Call lights', icon: BellRing },
]

/** Colour the floor by one question at a time, with its key right below. */
export function LayerDock() {
  const layer = useWard((s) => s.layer)
  const setLayer = useWard((s) => s.setLayer)
  const view = useWard((s) => s.view)
  if (view === 'list') return null
  return (
    <div className="dock">
      <div className="seg seg--dock" role="radiogroup" aria-label={say('Colour the floor by')}>
        {LAYERS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={layer === id} aria-label={say(label)} className="seg__btn" onClick={() => setLayer(id)}>
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{say(label)}</span>
          </button>
        ))}
      </div>
      <Legend layer={layer} />
    </div>
  )
}

function Legend({ layer }: { layer: Layer }) {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const scope = useWard((s) => s.scope)
  const ready = useWard(covers)
  if (layer === 'beds') {
    const c = day && ready ? census(day, t, scopeWings(scope).flatMap((w) => w.beds)) : undefined
    return (
      <ul className="legend">
        {(['occupied', 'ready', 'cleaning', 'dirty', 'blocked'] as BedState[]).map((s) => (
          <li key={s}>
            <i style={{ background: BED[s].soft, borderColor: BED[s].strong }} />
            {bedLabel(s)}
            {c && <span className="num legend__n">{c[s]}</span>}
          </li>
        ))}
      </ul>
    )
  }
  if (layer === 'calls') {
    return (
      <ul className="legend">
        <li><i style={{ background: callColor(1) }} />{say('Under 2 min')}</li>
        <li><i style={{ background: callColor(3) }} />{say('2 to 5 min')}</li>
        <li><i style={{ background: callColor(6) }} />{say('Over 5 min')}</li>
      </ul>
    )
  }
  const stops = layer === 'temp' ? TEMP_STOPS : AIR_STOPS
  const [lo, mid, hi] =
    layer === 'temp' ? [say('{v} °C', { v: 19 }), '22.5', say('{v} °C', { v: 26.5 })] : [say('{v} ppm', { v: 420 }), '860', say('{v} ppm', { v: '1,300' })]
  // A scale runs low to high left to right in either language, like the charts.
  return (
    <div className="ramp">
      <span className="ramp__bar" dir="ltr" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
      <span className="ramp__labels num" dir="ltr">
        <span>{lo}</span>
        <span>{mid}</span>
        <span>{hi}</span>
      </span>
      {/* Rooms show their own sensor; the corridors have none. */}
      <span className="ramp__note">{say('Corridors: estimated from the doors')}</span>
    </div>
  )
}

export function ViewTools() {
  const resetView = useWard((s) => s.resetView)
  const view = useWard((s) => s.view)
  // The whole hospital keeps its angle in plan view, so it still orbits.
  const flat = useWard((s) => s.view === 'plan' && s.scope !== HOSPITAL)
  if (view === 'list') return null
  return (
    <div className="tools">
      <button className="tool" onClick={resetView} aria-label={say('Reset the camera')} title={say('Reset the camera')}>
        <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <p className="hint">{flat ? say('Drag to pan, scroll to zoom') : say('Drag to orbit, right-drag to pan, scroll to zoom')}</p>
    </div>
  )
}
