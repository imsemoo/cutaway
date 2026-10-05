import { MathUtils, PerspectiveCamera, Vector3 } from 'three'

/* Framing a box in the camera, shared by the hospital's camera rig and the clinic's. */

const DEG = MathUtils.degToRad

/** A box by its corner and size, as the camera frames it. */
export type Box = { x: number; y: number; z: number; w: number; h: number; d: number }

export const cornersOf = (b: Box) =>
  [b.x, b.x + b.w].flatMap((x) => [b.y, b.y + b.h].flatMap((y) => [b.z, b.z + b.d].map((z) => new Vector3(x, y, z))))

type Area = { left: number; right: number; top: number; bottom: number }

/** The part of the canvas no overlay covers, in normalised device coordinates. */
export function safeArea(height: number): Area {
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
export function fitBox(corners: Vector3[], mid: Vector3, azimuth: number, polar: number, fov: number, aspect: number, area: Area) {
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
