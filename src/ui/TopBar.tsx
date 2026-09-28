import { Box, List, Map as MapIcon, Search as SearchIcon } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ROOMS } from '../data/floorplan'
import type { View } from '../data/types'
import { ASSET_LABEL } from '../lib/query'
import { useWard } from '../state/store'

const VIEWS: { id: View; label: string; icon: typeof Box }[] = [
  { id: '3d', label: '3D', icon: Box },
  { id: 'plan', label: 'Plan', icon: MapIcon },
  { id: 'list', label: 'List', icon: List },
]

export function TopBar() {
  const view = useWard((s) => s.view)
  const setView = useWard((s) => s.setView)
  return (
    <header className="bar">
      <div className="brand">
        <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="#111827" />
          <rect x="6" y="7" width="20" height="18" rx="1.5" fill="none" stroke="#e8ecf0" strokeWidth="2" />
          <path d="M6 14h20M16 14v11" stroke="#e8ecf0" strokeWidth="2" />
          <rect x="17.5" y="15.5" width="7" height="8" fill="#3d63ff" />
        </svg>
        <div className="brand__text">
          <span className="brand__name">Ward Twin</span>
          <span className="brand__where">Level 4 · Medical–surgical ward and ICU</span>
        </div>
      </div>
      <Search />
      <span className="badge" title="Every number on this page comes from a simulated day. No real patients or hospital.">
        Simulated data
      </span>
      <div className="seg" role="radiogroup" aria-label="View">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={view === id} className="seg__btn" onClick={() => setView(id)}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </header>
  )
}

type Hit = { type: 'room' | 'asset'; id: string; label: string; hint: string }

function Search() {
  const day = useWard((s) => s.day)
  const select = useWard((s) => s.select)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const all = useMemo<Hit[]>(() => {
    const rooms: Hit[] = ROOMS.map((r) => ({ type: 'room', id: r.id, label: r.kind === 'patient' || r.kind === 'icu' ? r.id : r.name, hint: r.kind === 'patient' || r.kind === 'icu' ? r.name : 'Room' }))
    const assets: Hit[] = (day?.assets ?? []).map((a) => ({ type: 'asset', id: a.id, label: a.id, hint: ASSET_LABEL[a.kind] }))
    return [...rooms, ...assets]
  }, [day])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return all.filter((h) => `${h.label} ${h.hint} ${h.id}`.toLowerCase().includes(s)).slice(0, 8)
  }, [q, all])

  const choose = (h: Hit) => {
    select({ type: h.type, id: h.id })
    setQ('')
    setOpen(false)
    input.current?.blur()
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(hits.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      choose(hits[active])
    } else if (e.key === 'Escape') {
      setQ('')
      setOpen(false)
      input.current?.blur()
    }
  }

  const expanded = open && q.trim().length > 0
  return (
    <div className="search">
      <SearchIcon className="search__icon" size={16} strokeWidth={1.75} aria-hidden="true" />
      <input
        ref={input}
        id="search"
        className="search__input"
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls="search-results"
        aria-activedescendant={expanded && hits[active] ? `hit-${hits[active].id}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Find a room or equipment"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
      />
      <kbd className="search__key" aria-hidden="true">/</kbd>
      {expanded && (
        <ul id="search-results" className="search__list" role="listbox" aria-label="Matches">
          {hits.length === 0 && <li className="search__empty">No room or equipment matches “{q.trim()}”. Try 4A09 or IVP.</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.type}-${h.id}`}
              id={`hit-${h.id}`}
              role="option"
              aria-selected={i === active}
              className="search__hit"
              onMouseDown={(e) => {
                e.preventDefault()
                choose(h)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="search__label">{h.label}</span>
              <span className="search__hint">{h.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
