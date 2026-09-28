import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { FLOOR, ROOM_BY_ID, center } from '../data/floorplan'
import { useWard } from '../state/store'
import { assetPositions } from './Equipment'

const { ACTION } = CameraControlsImpl
const DEG = MathUtils.degToRad
const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const CORNERS = [0, FLOOR.w].flatMap((x) => [0, FLOOR.wallHeight].flatMap((y) => [0, FLOOR.d].map((z) => new Vector3(x, y, z))))
const MID = new Vector3(FLOOR.w / 2, 0, FLOOR.d / 2)

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
  Distance and screen offset that fit the whole floor into the safe area,
  found by projecting the building's corners through a trial camera.
*/
function fitFloor(azimuth: number, polar: number, fov: number, aspect: number, area: Area) {
  const cam = new PerspectiveCamera(fov, aspect, 0.1, 2000)
  const dir = new Vector3().setFromSphericalCoords(1, Math.max(polar, 1e-4), azimuth)
  const v = new Vector3()
  const bounds = (d: number) => {
    cam.position.copy(MID).addScaledVector(dir, d)
    cam.lookAt(MID)
    cam.updateMatrixWorld()
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const c of CORNERS) {
      v.copy(c).project(cam)
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
    }
    return { minX, maxX, minY, maxY }
  }
  let lo = 5
  let hi = 800
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
  const ref = useRef<CameraControlsImpl>(null)
  const opened = useRef(false)
  const view = useWard((s) => s.view)
  const selection = useWard((s) => s.selection)
  const resetKey = useWard((s) => s.resetKey)
  const size = useThree((s) => s.size)
  const fov = useThree((s) => ('fov' in s.camera ? (s.camera as PerspectiveCamera).fov : 35))
  const aspect = size.width / Math.max(1, size.height)
  const plan = view === 'plan'
  const portrait = aspect < 0.9

  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.minPolarAngle = 0
    c.maxPolarAngle = plan ? 0 : DEG(78)
    c.minAzimuthAngle = -Infinity
    c.maxAzimuthAngle = Infinity
    c.mouseButtons.left = plan ? ACTION.TRUCK : ACTION.ROTATE
    c.mouseButtons.right = ACTION.TRUCK
    c.touches.one = plan ? ACTION.TOUCH_TRUCK : ACTION.TOUCH_ROTATE
    c.minDistance = 6
    c.maxDistance = 220
    // The first move is the opening shot, down from the plan; the rest are quick.
    c.smoothTime = opened.current ? 0.35 : 0.9
    opened.current = true
    const animate = !reduced

    // A tall screen turns the building so its long side runs up the screen.
    const azimuth = plan ? (portrait ? DEG(-90) : 0) : portrait ? DEG(-68) : DEG(-18)
    const area = safeArea(size.height)

    const state = useWard.getState()
    let focus: { x: number; z: number } | undefined
    if (selection?.type === 'room') focus = center(ROOM_BY_ID[selection.id])
    if (selection?.type === 'asset' && state.day) focus = assetPositions(state.day, state.t).get(selection.id)

    if (focus) {
      const polar = plan ? 0 : DEG(42)
      const dist = (plan ? 30 : 24) * (portrait ? 1.35 : 1)
      const halfH = dist * Math.tan(DEG(fov) / 2)
      void c.rotateTo(plan ? azimuth : c.azimuthAngle, polar, animate)
      void c.moveTo(focus.x, 0, focus.z, animate)
      void c.dollyTo(dist, animate)
      void c.setFocalOffset(0, ((area.top + area.bottom) / 2) * halfH, 0, animate)
      return
    }

    const polar = plan ? 0 : DEG(portrait ? 46 : 50)
    const fit = fitFloor(azimuth, polar, fov, aspect, area)
    void c.rotateTo(azimuth, polar, animate)
    void c.moveTo(MID.x, 0, MID.z, animate)
    void c.dollyTo(fit.dist, animate)
    void c.setFocalOffset(fit.offset.x, fit.offset.y, 0, animate)
    // Keyed on the bucketed aspect, so a resize refits the overview once.
  }, [plan, selection?.type, selection?.id, resetKey, Math.round(aspect * 4) / 4, portrait])

  return <CameraControls ref={ref} makeDefault />
}
