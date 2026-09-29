import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { LEVELS, PLATE, ROOM_BY_ID, STOREY, WING, WING_BY_CODE, center } from '../data/floorplan'
import { HOSPITAL, scopeLevel, type Scope } from '../state/scope'
import { useWard } from '../state/store'
import { assetPositions } from '../lib/positions'
import { assetAt } from '../lib/query'
import { RIM, levelY } from './layout'

const { ACTION } = CameraControlsImpl
const DEG = MathUtils.degToRad
const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The box to frame: one wing or one level at its height, or the whole tower with its levels drawn apart. */
function frameBox(scope: Scope) {
  // A level's plate reaches a rim beyond its wings.
  if (scope === HOSPITAL) return { x: -RIM, y: 0, z: -RIM, w: PLATE.w + RIM * 2, h: levelY(LEVELS[LEVELS.length - 1]) + STOREY.wallHeight, d: PLATE.d + RIM * 2 }
  const level = scopeLevel(scope)
  if (level) return { x: -RIM, y: levelY(level), z: -RIM, w: PLATE.w + RIM * 2, h: STOREY.wallHeight, d: PLATE.d + RIM * 2 }
  const w = WING_BY_CODE[scope]
  return { x: w.x, y: levelY(w.level), z: w.z, w: WING.w, h: STOREY.wallHeight, d: WING.d }
}
const cornersOf = (b: ReturnType<typeof frameBox>) =>
  [b.x, b.x + b.w].flatMap((x) => [b.y, b.y + b.h].flatMap((y) => [b.z, b.z + b.d].map((z) => new Vector3(x, y, z))))

type Area = { left: number; right: number; top: number; bottom: number }

/** The part of the canvas no overlay covers, in normalised device coordinates. */
function safeArea(height: number): Area {
  const dock = document.querySelector('.dock')?.getBoundingClientRect()
  const tools = document.querySelector('.tools')?.getBoundingClientRect()
  const bottom = (dock?.height ?? 0) + 28
  const top = (tools?.height ?? 0) + 24
  return { left: -0.95, right: 0.95, top: 1 - (2 * top) / height, bottom: -1 + (2 * bottom) / height }
}

/**
  Distance and screen offset that fit a box into the safe area, found by
  projecting its corners through a trial camera.
*/
function fitBox(corners: Vector3[], mid: Vector3, azimuth: number, polar: number, fov: number, aspect: number, area: Area) {
  const cam = new PerspectiveCamera(fov, aspect, 0.1, 2000)
  const dir = new Vector3().setFromSphericalCoords(1, Math.max(polar, 1e-4), azimuth)
  const v = new Vector3()
  const bounds = (d: number) => {
    cam.position.copy(mid).addScaledVector(dir, d)
    cam.lookAt(mid)
    cam.updateMatrixWorld()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of corners) {
      v.copy(c).project(cam)
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
    }
    return { minX, maxX, minY, maxY }
  }
  let lo = 5
  let hi = 2000
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2
    const b = bounds(mid)
    if (b.maxX - b.minX <= area.right - area.left && b.maxY - b.minY <= area.top - area.bottom) hi = mid
    else lo = mid
  }
  const b = bounds(hi)
  const halfH = hi * Math.tan(DEG(fov) / 2)
  const dx = (area.left + area.right) / 2 - (b.minX + b.maxX) / 2
  const dy = (area.top + area.bottom) / 2 - (b.minY + b.maxY) / 2
  // camera-controls moves the camera by +x and -y of the focal offset.
  return { dist: hi, offset: { x: -dx * halfH * aspect, y: dy * halfH } }
}

export function CameraRig() {
  // The controls arrive through a callback ref, so the first framing waits for them.
  const [c, setControls] = useState<CameraControlsImpl | null>(null)
  const opened = useRef(false)
  const view = useWard((s) => s.view)
  const scope = useWard((s) => s.scope)
  const selection = useWard((s) => s.selection)
  const route = useWard((s) => s.route)
  const resetKey = useWard((s) => s.resetKey)
  const size = useThree((s) => s.size)
  const fov = useThree((s) => ('fov' in s.camera ? (s.camera as PerspectiveCamera).fov : 35))
  const aspect = size.width / Math.max(1, size.height)
  const plan = view === 'plan'
  const portrait = aspect < 0.9
  // Refit only when the aspect crosses a quarter step, not on every pixel of a resize.
  const aspectStep = Math.round(aspect * 4) / 4
  const frame = useRef({ aspect, fov, height: size.height })
  frame.current = { aspect, fov, height: size.height }

  useEffect(() => {
    if (!c) return
    const { aspect, fov, height } = frame.current
    // A plan is drawn from straight above; the whole hospital keeps its angle, or the top level would hide the rest.
    const whole = scope === HOSPITAL
    const above = plan && !whole
    c.minPolarAngle = 0
    c.maxPolarAngle = above ? 0 : DEG(78)
    c.minAzimuthAngle = -Infinity
    c.maxAzimuthAngle = Infinity
    c.mouseButtons.left = above ? ACTION.TRUCK : ACTION.ROTATE
    c.mouseButtons.right = ACTION.TRUCK
    c.touches.one = above ? ACTION.TOUCH_TRUCK : ACTION.TOUCH_ROTATE
    c.minDistance = 6
    c.maxDistance = whole ? 1400 : scopeLevel(scope) ? 700 : 220
    // The first move is the opening shot, down from the plan; the rest are quick.
    const first = !opened.current
    c.smoothTime = first ? 0.9 : 0.35
    opened.current = true
    const animate = !reduced

    // A tall screen turns a wing so its long side runs up the screen; the whole hospital stays across, its levels stacked up the screen.
    const azimuth = whole ? DEG(-24) : above ? (portrait ? DEG(-90) : 0) : portrait ? DEG(-68) : DEG(-18)
    const area = safeArea(height)

    const state = useWard.getState()
    let focus: { x: number; y: number; z: number } | undefined
    if (selection?.type === 'room') {
      const r = ROOM_BY_ID[selection.id]
      focus = { ...center(r), y: levelY(r.level) }
    }
    const asset = selection?.type === 'asset' ? state.day?.assets.find((a) => a.id === selection.id) : undefined
    const at = asset && state.day ? assetPositions(state.day, state.t).get(asset.id) : undefined
    if (asset && at) focus = { ...at, y: levelY(ROOM_BY_ID[assetAt(asset, state.t).loc].level) }

    // A route is framed whole, from the room to the equipment, on every level it crosses.
    if (route) {
      const xs = route.points.map((p) => p.x)
      const zs = route.points.map((p) => p.z)
      const ys = route.points.map((p) => levelY(p.level))
      const pad = 6
      const box = { x: Math.min(...xs) - pad, y: Math.min(...ys), z: Math.min(...zs) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + STOREY.wallHeight, d: Math.max(...zs) - Math.min(...zs) + pad * 2 }
      const mid = new Vector3(box.x + box.w / 2, box.y + box.h / 2, box.z + box.d / 2)
      const polar = above ? 0 : DEG(whole ? 60 : 50)
      const fit = fitBox(cornersOf(box), mid, azimuth, polar, fov, aspect, area)
      void c.rotateTo(azimuth, polar, animate)
      void c.moveTo(mid.x, mid.y, mid.z, animate)
      void c.dollyTo(Math.max(fit.dist, 18), animate)
      void c.setFocalOffset(fit.offset.x, fit.offset.y, 0, animate)
      return
    }

    if (focus) {
      const polar = above ? 0 : DEG(42)
      const dist = (above ? 30 : 24) * (portrait ? 1.35 : 1)
      const halfH = dist * Math.tan(DEG(fov) / 2)
      // Keep the visitor's own angle, except on the opening shot of a shared link.
      void c.rotateTo(above || first ? azimuth : c.azimuthAngle, polar, animate)
      void c.moveTo(focus.x, focus.y, focus.z, animate)
      void c.dollyTo(dist, animate)
      void c.setFocalOffset(0, ((area.top + area.bottom) / 2) * halfH, 0, animate)
      return
    }

    // The hospital is seen from lower down, so the levels drawn apart show their floors.
    const polar = above ? 0 : DEG(whole ? 60 : portrait ? 46 : 50)
    const box = frameBox(scope)
    const mid = new Vector3(box.x + box.w / 2, box.y + (whole ? box.h / 2 : 0), box.z + box.d / 2)
    const fit = fitBox(cornersOf(box), mid, azimuth, polar, fov, aspect, area)
    void c.rotateTo(azimuth, polar, animate)
    void c.moveTo(mid.x, mid.y, mid.z, animate)
    void c.dollyTo(fit.dist, animate)
    void c.setFocalOffset(fit.offset.x, fit.offset.y, 0, animate)
  }, [c, plan, scope, selection?.type, selection?.id, route, resetKey, aspectStep, portrait])

  return <CameraControls ref={setControls} makeDefault />
}
