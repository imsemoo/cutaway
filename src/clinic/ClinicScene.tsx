import { CameraControls, CameraControlsImpl, Grid } from '@react-three/drei'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, MathUtils, PerspectiveCamera, ShapeUtils, Vector2, Vector3 } from 'three'
import type { Building, BuildingSpace, Pt } from '../data/building'
import type { Day, Layer } from '../data/types'
import { say, useLang } from '../i18n'
import { ACCENT, BED, NEUTRAL_FLOOR, SUPPORT_FLOOR, callColor } from '../lib/colors'
import { activeCall, bedAt, sample } from '../lib/query'
import { cornersOf, fitBox, safeArea } from '../scene/fit'
import { airColor, tempColor } from '../scene/ramp'
import { TagTracker } from '../scene/TagTracker'
import { useWard } from '../state/store'
import { WALL, extent, floorOffset, type Floors, type Spread } from './layout'
import { useClinic } from './state'

/*
  The imported clinic in 3D, drawn from its BIM model's own outlines. Each
  floor is two meshes: every room's floor slab in one, coloured per room
  by the layer on show, and every wall's footprint pulled up into a wall
  in the other, the door openings left open. The walls are cut low in 3D and
  drop to a section cut in plan, where they turn to ink, as the hospital's do.
*/

const CUT = 0.15
const { ACTION } = CameraControlsImpl
const DEG = MathUtils.degToRad
const reduced = typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Each triangle of a plan outline, as three points, turned to face up. */
function triangles(outline: Pt[]) {
  const pts = outline.map(([x, z]) => new Vector2(x, z))
  return ShapeUtils.triangulateShape(pts, []).map(([a, b, c]) => {
    const [p, q, r] = [outline[a], outline[b], outline[c]]
    // Facing up means turning one way seen from above; earcut may have gone the other.
    return (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]) >= 0 ? [p, q, r] : [p, r, q]
  })
}

/** One floor's rooms as one mesh: their slabs' triangles, which room each triangle belongs to, and each room's run of vertices. */
function floorSlabs(rooms: BuildingSpace[]) {
  const pos: number[] = []
  const owner: number[] = []
  const runs: [number, number][] = []
  rooms.forEach((room, i) => {
    const start = pos.length / 3
    for (const tri of triangles(room.outline)) {
      for (const [x, z] of tri) pos.push(x, 0, z)
      owner.push(i)
    }
    runs.push([start, pos.length / 3 - start])
  })
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
  g.setAttribute('color', new Float32BufferAttribute(new Array(pos.length).fill(1), 3))
  return { geometry: g, owner, runs }
}

/** One floor's walls, a metre tall, so the mesh can be scaled to the height on show. */
function walls(outlines: Pt[][]) {
  const pos: number[] = []
  const nor: number[] = []
  const add = (x: number, y: number, z: number, n: [number, number, number]) => {
    pos.push(x, y, z)
    nor.push(...n)
  }
  for (const raw of outlines) {
    // Wound the same way round, so every side faces out.
    const signed = raw.reduce((s, [x, z], i) => s + x * raw[(i + 1) % raw.length][1] - raw[(i + 1) % raw.length][0] * z, 0)
    const loop = signed >= 0 ? raw : [...raw].reverse()
    for (let i = 0; i < loop.length; i++) {
      const [ax, az] = loop[i]
      const [bx, bz] = loop[(i + 1) % loop.length]
      const len = Math.hypot(bx - ax, bz - az) || 1
      const n: [number, number, number] = [(bz - az) / len, 0, -(bx - ax) / len]
      for (const [x, y, z] of [[ax, 0, az], [bx, 1, bz], [bx, 0, bz], [ax, 0, az], [ax, 1, az], [bx, 1, bz]] as const) add(x, y, z, n)
    }
    for (const tri of triangles(loop)) for (const [x, z] of tri) add(x, 1, z, [0, 1, 0])
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  return g
}

const neutral = new Color(NEUTRAL_FLOOR)
const support = new Color(SUPPORT_FLOOR)
const accent = new Color(ACCENT)
const bed = Object.fromEntries(Object.entries(BED).map(([k, v]) => [k, new Color(v.soft)])) as Record<keyof typeof BED, Color>

/** A room's colour in a layer at minute t. */
function roomColor(room: BuildingSpace, day: Day, t: number, layer: Layer, out: Color) {
  const env = day.rooms[room.id]
  if (layer === 'temp') return tempColor(sample(env.temp, t), out)
  if (layer === 'air') return airColor(sample(env.co2, t), out)
  if (room.kind !== 'care') return out.copy(room.kind === 'circulation' || room.kind === 'waiting' ? neutral : support)
  if (layer === 'calls') {
    const call = activeCall(day, room.id, t)
    return out.set(callColor(call ? t - call.at : undefined))
  }
  const s = bedAt(day, room.id, t)
  return out.copy(s ? bed[s.state] : neutral)
}

function Floor({ building, storey, floors, spread }: { building: Building; storey: number; floors: Floors; spread: Spread }) {
  const day = useWard((s) => s.day)
  const t = useWard((s) => s.t)
  const layer = useWard((s) => s.layer)
  const view = useWard((s) => s.view)
  const hover = useWard((s) => s.hover)
  const selection = useWard((s) => s.selection)
  const setHover = useWard((s) => s.setHover)
  const select = useWard((s) => s.select)
  const invalidate = useThree((s) => s.invalidate)
  const rooms = useMemo(() => building.spaces.filter((s) => s.storey === storey), [building, storey])
  const slabs = useMemo(() => floorSlabs(rooms), [rooms])
  const wallMesh = useMemo(() => walls(building.walls.filter((w) => w.storey === storey).map((w) => w.outline)), [building, storey])
  const plan = view === 'plan'
  const off = floorOffset(building, storey, floors, spread)
  const visible = floors === 'all' || floors === storey

  useLayoutEffect(() => {
    if (!day) return
    const color = slabs.geometry.getAttribute('color') as Float32BufferAttribute
    const c = new Color()
    rooms.forEach((room, i) => {
      roomColor(room, day, t, layer, c)
      if (selection?.id === room.id) c.lerp(accent, 0.45)
      else if (hover === room.id) c.multiplyScalar(0.86)
      const [start, count] = slabs.runs[i]
      for (let v = start; v < start + count; v++) color.setXYZ(v, c.r, c.g, c.b)
    })
    color.needsUpdate = true
    invalidate()
  }, [day, t, layer, hover, selection, rooms, slabs, invalidate])

  const roomAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.faceIndex == null ? undefined : rooms[slabs.owner[e.faceIndex]])
  return (
    <group position={[off.x, 0, off.z]} visible={visible}>
      <mesh
        geometry={slabs.geometry}
        receiveShadow
        onPointerMove={(e) => {
          e.stopPropagation()
          const room = roomAt(e)
          if (room && room.id !== useWard.getState().hover) setHover(room.id)
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          // A drag to turn the camera is not a pick.
          if (e.delta > 4) return
          e.stopPropagation()
          const room = roomAt(e)
          if (room) select({ type: 'room', id: room.id })
        }}
      >
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <mesh geometry={wallMesh} scale={[1, plan ? CUT : WALL, 1]} castShadow receiveShadow raycast={() => null}>
        <meshStandardMaterial color={plan ? '#2a3441' : '#fbfbfc'} roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Frames what is on show, clear of the layer dock: from the south and above in 3D, straight down in plan; a picked room up close. */
function Camera({ building, floors, spread }: { building: Building; floors: Floors; spread: Spread }) {
  const [c, setControls] = useState<CameraControlsImpl | null>(null)
  const view = useWard((s) => s.view)
  const picked = useWard((s) => s.selection?.id)
  const size = useThree((s) => s.size)
  const fov = useThree((s) => ('fov' in s.camera ? (s.camera as PerspectiveCamera).fov : 35))
  const aspect = size.width / Math.max(1, size.height)
  // Refit only when the aspect crosses a quarter step, not on every pixel of a resize.
  const aspectStep = Math.round(aspect * 4) / 4
  const frame = useRef({ aspect, fov, height: size.height })
  frame.current = { aspect, fov, height: size.height }
  useLayoutEffect(() => {
    if (!c) return
    const { aspect, fov, height } = frame.current
    const plan = view === 'plan'
    c.minPolarAngle = 0
    c.maxPolarAngle = plan ? 0 : DEG(78)
    c.mouseButtons.left = plan ? ACTION.TRUCK : ACTION.ROTATE
    c.mouseButtons.right = ACTION.TRUCK
    c.touches.one = plan ? ACTION.TOUCH_TRUCK : ACTION.TOUCH_ROTATE
    c.minDistance = 6
    c.maxDistance = 600
    const animate = !reduced
    const across = spread !== 'beyond'
    const azimuth = plan ? 0 : DEG(across ? -18 : -30)
    const polar = plan ? 0 : DEG(50)
    const area = safeArea(height)
    const room = picked && building.spaces.find((s) => s.id === picked)
    if (room && (floors === 'all' || floors === room.storey)) {
      const off = floorOffset(building, room.storey, floors, spread)
      const dist = (plan ? 46 : 40) * (across ? 1 : 1.35)
      const halfH = dist * Math.tan(DEG(fov) / 2)
      void c.rotateTo(plan ? azimuth : c.azimuthAngle, polar, animate)
      void c.moveTo(room.label[0] + off.x, 0, room.label[1] + off.z, animate)
      void c.dollyTo(dist, animate)
      void c.setFocalOffset(0, ((area.top + area.bottom) / 2) * halfH, 0, animate)
      return
    }
    const e = extent(building, floors, spread)
    // With both floors on show, their names stand just beyond them, and are framed too.
    const names = floors === 'all' ? 6 : 0
    const box = { x: e.x0, y: 0, z: e.z0 - names, w: e.x1 - e.x0, h: plan ? CUT : WALL, d: e.z1 - e.z0 + names }
    const mid = new Vector3(box.x + box.w / 2, 0, box.z + box.d / 2)
    const fit = fitBox(cornersOf(box), mid, azimuth, polar, fov, aspect, area)
    void c.rotateTo(azimuth, polar, animate)
    void c.moveTo(mid.x, mid.y, mid.z, animate)
    void c.dollyTo(fit.dist, animate)
    void c.setFocalOffset(fit.offset.x, fit.offset.y, 0, animate)
  }, [c, building, floors, spread, view, picked, aspectStep])
  return <CameraControls ref={setControls} makeDefault />
}

export default function ClinicScene() {
  const building = useClinic((s) => s.building)
  const floors = useClinic((s) => s.floors)
  if (!building) return null
  const c = { x: building.size.w / 2, z: building.size.d / 2 }
  return (
    <Canvas
      className="model"
      aria-label={say('3D model of the clinic')}
      role="img"
      frameloop="demand"
      flat
      shadows="percentage"
      dpr={[1, 1.5]}
      camera={{ fov: 35, near: 0.5, far: 1200, position: [c.x + 60, 90, c.z + 90] }}
      gl={{ antialias: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#e8ecf0']} />
      <hemisphereLight args={['#ffffff', '#cdd4dc', 1.35]} />
      <directionalLight
        position={[c.x + 40, 90, c.z + 60]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-far={300}
        shadow-bias={-0.0005}
      >
        <object3D attach="target" position={[c.x, 0, c.z]} />
      </directionalLight>
      <Grid position={[c.x, -0.05, c.z]} args={[400, 400]} cellSize={1} cellThickness={0.6} cellColor="#d3d9e0" sectionSize={5} sectionThickness={1} sectionColor="#bac3cd" fadeDistance={260} fadeStrength={2} infiniteGrid />
      <Floors building={building} floors={floors} />
      <TagTracker />
    </Canvas>
  )
}

/** The floors and the camera, laid out for the canvas: side by side when it is wide, the lower floor first as the page reads; one beyond the other when it is tall. */
function Floors({ building, floors }: { building: Building; floors: Floors }) {
  const size = useThree((s) => s.size)
  const rtl = useLang((s) => s.lang === 'ar')
  const spread: Spread = size.width / Math.max(1, size.height) < 0.9 ? 'beyond' : rtl ? 'left' : 'right'
  // The labels outside the canvas follow the same layout.
  useLayoutEffect(() => useClinic.setState({ spread }), [spread])
  return (
    <>
      {building.storeys.map((_, i) => (
        <Floor key={i} building={building} storey={i} floors={floors} spread={spread} />
      ))}
      <Camera building={building} floors={floors} spread={spread} />
    </>
  )
}
