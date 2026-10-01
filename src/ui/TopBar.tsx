import { Box, List, Map as MapIcon, Search as SearchIcon } from 'lucide-react'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { BED_ROOMS, ROOMS, WINGS, WING_BY_CODE, isBed } from '../data/floorplan'
import type { View } from '../data/types'
import { plural, say, setLang, useLang } from '../i18n'
import { assetLabel, roomName, roomTitle, wingName } from '../lib/query'
import { HOSPITAL, scopeLevel, scopeWings } from '../state/scope'
import { useWard } from '../state/store'

const VIEWS: { id: View; label: string; icon: typeof Box }[] = [
  { id: '3d', label: '3D', icon: Box },
  { id: 'plan', label: 'Plan', icon: MapIcon },
  { id: 'list', label: 'List', icon: List },
]

const beds = (n: number) => plural(n, '{n} bed', '{n} beds')

export function TopBar() {
  const view = useWard((s) => s.view)
  const setView = useWard((s) => s.setView)
  const scope = useWard((s) => s.scope)
  const lang = useLang((s) => s.lang)
  const level = scopeLevel(scope)
  const where =
    scope === HOSPITAL
      ? say('Whole hospital · {wings}, {beds}', { wings: plural(WINGS.length, '{n} wing', '{n} wings'), beds: beds(BED_ROOMS.length) })
      : level
        ? say('Level {level} · six wings, {beds}', { level, beds: beds(scopeWings(scope).reduce((n, w) => n + w.beds.length, 0)) })
        : say('{wing} · two wards and an ICU', { wing: wingName(WING_BY_CODE[scope]) })
  return (
    <header className="bar">
      <div className="brand">
        {/* The mark, public/logo.svg: three floors drawn apart, the middle one cut open, its section in blue. A file, not inline, so it stays out of the first load. */}
        <img className="brand__mark" src="./logo.svg" alt="" width="28" height="28" />
        <div className="brand__text">
          <span className="brand__name">{say('Cutaway')}</span>
          <span className="brand__where">{where}</span>
        </div>
      </div>
      {/* Its names are in the language on show, so it starts over in a new one. */}
      <Search key={lang} />
      <span className="badge" title={say('Every number on this page comes from a simulated day. No real patients or hospital.')}>
        {say('Simulated data')}
      </span>
      <Language />
      <div className="seg" role="radiogroup" aria-label={say('View')}>
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="radio" aria-checked={view === id} aria-label={say(label)} className="seg__btn" onClick={() => setView(id)}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>{say(label)}</span>
          </button>
        ))}
      </div>
    </header>
  )
}

/** The other language, named in itself, so a reader of either can find it. */
function Language() {
  const lang = useLang((s) => s.lang)
  const other = lang === 'ar' ? 'en' : 'ar'
  return (
    <button className="lang" lang={other} onClick={() => void setLang(other)}>
      {other === 'ar' ? 'العربية' : 'English'}
    </button>
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
    // Every wing has its lounge and its store, so the hint names the wing.
    const rooms: Hit[] = ROOMS.map((r) => ({ type: 'room', id: r.id, label: roomTitle(r), hint: isBed(r) ? roomName(r.id) : wingName(WING_BY_CODE[r.wing]) }))
    const assets: Hit[] = (day?.assets ?? []).map((a) => ({ type: 'asset', id: a.id, label: a.id, hint: `${assetLabel(a.kind)} · ${a.wing}` }))
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
        placeholder={say('Find a room or equipment')}
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
        <ul id="search-results" className="search__list" role="listbox" aria-label={say('Matches')}>
          {hits.length === 0 && <li className="search__empty">{say('No room or equipment matches “{q}”. Try 4A09 or IVP.', { q: q.trim() })}</li>}
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
