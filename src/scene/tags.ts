/*
  Floating tags live in the page's own DOM, not inside the canvas. Each one
  registers the world point it hangs from; the tracker in the scene projects
  those points every rendered frame and moves the tags with a transform.
*/
export interface Anchor {
  el: HTMLElement
  x: number
  y: number
  z: number
}

export const anchors = new Map<string, Anchor>()
let onChange: (() => void) | null = null

export function setAnchor(key: string, anchor: Anchor | null) {
  if (anchor) anchors.set(key, anchor)
  else anchors.delete(key)
  onChange?.()
}

export function watchAnchors(fn: () => void) {
  onChange = fn
  return () => {
    if (onChange === fn) onChange = null
  }
}
