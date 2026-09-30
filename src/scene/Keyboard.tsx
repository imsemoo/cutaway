import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { ROOM_BY_ID, WING_BY_CODE } from '../data/floorplan'
import { say } from '../i18n'
import { roomName, wingName } from '../lib/query'
import { HOSPITAL, isWing, levelScope, scopeLevel } from '../state/scope'
import { useWard } from '../state/store'
import { wingSummaries } from '../ui/summary'
import { roomReading } from '../ui/Tags'
import { nearest, spots, towards, type Spot } from './cursor'

const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/*
  The model by keyboard. Focused, it takes the arrow keys: the cursor moves
  to the nearest room that way on screen, or, in a level or the whole
  hospital, the nearest wing. Enter opens what it is on; Escape, with nothing
  selected, steps back out to the level and then the hospital. The cursor is
  the hover, so it lights the floor and shows the tag a pointer would, and
  each move is said in the live region beside the canvas.
*/
export function KeyboardCursor() {
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)

  useEffect(() => {
    const model = gl.domElement.closest<HTMLElement>('.model')
    const said = document.getElementById('model-said')
    if (!model) return
    const v = new Vector3()
    // The spot the keyboard put the cursor on, so a blur clears only its own.
    let mine: string | null = null

    const onScreen = (s: Spot): { id: string; p: [number, number] } => {
      const { camera, size } = get()
      v.set(s.x, s.y, s.z).project(camera)
      return { id: s.id, p: [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height] }
    }
    // A live region repeats nothing, so the same words twice differ by a space.
    const tell = (text: string) => {
      if (said) said.textContent = said.textContent === text ? `${text}\u00a0` : text
    }
    const describe = (id: string) => {
      const { day, t, layer } = useWard.getState()
      if (ROOM_BY_ID[id]) return day ? say('{name}, {reading}', { name: roomName(id), reading: roomReading(day, id, t, layer) }) : roomName(id)
      const w = WING_BY_CODE[id]
      const s = day ? wingSummaries(day, t).get(id) : undefined
      if (!s) return wingName(w)
      const words = s.critical ? '{wing}: {occupied} of {beds} beds occupied, something critical open' : '{wing}: {occupied} of {beds} beds occupied'
      return say(words, { wing: wingName(w), occupied: s.occupied, beds: s.beds })
    }
    const land = (id: string | undefined) => {
      if (!id) return
      mine = id
      useWard.getState().setHover(id)
      tell(describe(id))
    }
    // Where the cursor starts: on what is selected or hovered, else nearest the middle of the view.
    const start = () => {
      const { scope, selection, hover } = useWard.getState()
      const here = spots(scope)
      const has = (id: string | null | undefined) => id && here.some((s) => s.id === id)
      if (has(selection?.id)) return selection!.id
      if (has(hover)) return hover!
      const { size } = get()
      return nearest([size.width / 2, size.height / 2], here.map(onScreen))
    }

    const onKey = (e: KeyboardEvent) => {
      const s = useWard.getState()
      const arrow = ARROWS[e.key]
      if (arrow) {
        e.preventDefault()
        const here = spots(s.scope)
        const current = here.find((p) => p.id === s.hover)
        if (!current) return land(start())
        const next = towards(onScreen(current).p, arrow, here.filter((p) => p !== current).map(onScreen))
        if (next) land(next)
        else tell(isWing(s.scope) ? say('No room further that way.') : say('No wing further that way.'))
      } else if (e.key === 'Enter' && s.hover) {
        e.preventDefault()
        if (ROOM_BY_ID[s.hover]) s.select({ type: 'room', id: s.hover })
        else if (WING_BY_CODE[s.hover]) {
          const wing = WING_BY_CODE[s.hover]
          s.setScope(wing.code)
          mine = null
          tell(wingName(wing))
        }
      } else if (e.key === 'Escape' && !s.selection && s.scope !== HOSPITAL) {
        // With something selected, Escape clears it first; the app's own key handler does that.
        e.preventDefault()
        const from = s.scope
        const up = isWing(from) ? levelScope(WING_BY_CODE[from].level) : HOSPITAL
        s.setScope(up)
        const place = up === HOSPITAL ? say('The whole hospital') : say('Level {level}', { level: scopeLevel(up)! })
        if (isWing(from)) {
          mine = from
          s.setHover(from)
          tell(`${place}. ${describe(from)}`)
        } else {
          tell(place)
        }
      }
    }
    // Only a keyboard focus places the cursor; a click that focuses the model leaves the pointer in charge.
    const onFocus = () => {
      if (model.matches(':focus-visible') && !useWard.getState().hover) land(start())
    }
    const onBlur = () => {
      if (mine && useWard.getState().hover === mine) useWard.getState().setHover(null)
      mine = null
    }

    model.addEventListener('keydown', onKey)
    model.addEventListener('focus', onFocus)
    model.addEventListener('blur', onBlur)
    return () => {
      model.removeEventListener('keydown', onKey)
      model.removeEventListener('focus', onFocus)
      model.removeEventListener('blur', onBlur)
    }
  }, [gl, get])

  return null
}
