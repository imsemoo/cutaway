import { BedDouble, BellRing, RotateCcw, Thermometer, Wind } from 'lucide-react'
import type { BedState, Layer } from '../data/types'
import { AIR_STOPS, BED, TEMP_STOPS, callColor } from '../lib/colors'
import { BED_LABEL, census } from '../lib/query'
import { useWard } from '../state/store'

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
      <div className="seg seg--dock" role="radiogroup" aria-label="Colour the floor by">
        {LAYERS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={layer === id} aria-label={label} className="seg__btn" onClick={() => setLayer(id)}>
            <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
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
  if (layer === 'beds') {
    const c = day ? census(day, t) : undefined
    return (
      <ul className="legend">
        {(['occupied', 'ready', 'cleaning', 'dirty', 'blocked'] as BedState[]).map((s) => (
          <li key={s}>
            <i style={{ background: BED[s].soft, borderColor: BED[s].strong }} />
            {BED_LABEL[s]}
            {c && <span className="num legend__n">{c[s]}</span>}
          </li>
        ))}
      </ul>
    )
  }
  if (layer === 'calls') {
    return (
      <ul className="legend">
        <li><i style={{ background: callColor(1) }} />Under 2 min</li>
        <li><i style={{ background: callColor(3) }} />2 to 5 min</li>
        <li><i style={{ background: callColor(6) }} />Over 5 min</li>
      </ul>
    )
  }
  const stops = layer === 'temp' ? TEMP_STOPS : AIR_STOPS
  const [lo, mid, hi] = layer === 'temp' ? ['19 °C', '22.5', '26.5 °C'] : ['420 ppm', '860', '1,300 ppm']
  return (
    <div className="ramp">
      <span className="ramp__bar" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
      <span className="ramp__labels num">
        <span>{lo}</span>
        <span>{mid}</span>
        <span>{hi}</span>
      </span>
    </div>
  )
}

export function ViewTools() {
  const resetView = useWard((s) => s.resetView)
  const view = useWard((s) => s.view)
  if (view === 'list') return null
  return (
    <div className="tools">
      <button className="tool" onClick={resetView} aria-label="Reset the camera to the whole floor" title="Whole floor">
        <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <p className="hint">{view === 'plan' ? 'Drag to pan, scroll to zoom' : 'Drag to orbit, right-drag to pan, scroll to zoom'}</p>
    </div>
  )
}
