import { Grid } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, lazy, useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type DirectionalLight } from 'three'
import { PLATE, WING, WING_BY_CODE } from '../data/floorplan'
import { START, dprFor, useQuality } from '../state/quality'
import { HOSPITAL, scopeLevel, type Scope } from '../state/scope'
import { useWard } from '../state/store'
import { Beds } from './Beds'
import { CameraRig } from './CameraRig'
import { Equipment } from './Equipment'
import { Corridors } from './Corridors'
import { Floors } from './Floors'
import { FrameMeter } from './FrameMeter'
import { Overlays } from './Overlays'
import { Route } from './Route'
import { AdaptiveQuality, ContextWatch } from './Resilience'
import { Shell } from './Shell'
import { TagTracker } from './TagTracker'
import { scopeY } from './layout'
import { markShadows, takeShadowFlag } from './shadows'

const stats = typeof window !== 'undefined' && new URLSearchParams(location.search).has('stats')
const Effects = lazy(() => import('./Effects'))

/** The centre of what is on show: a wing's or a level's floor, or the tower's footprint. */
function middle(scope: Scope) {
  if (scope === HOSPITAL || scopeLevel(scope)) return { x: PLATE.w / 2, y: scopeY(scope), z: PLATE.d / 2 }
  const w = WING_BY_CODE[scope]
  return { x: w.x + WING.w / 2, y: scopeY(scope), z: w.z + WING.d / 2 }
}

/** The sun follows the scope, and its shadow frustum covers a wing closely, a level or the whole tower more loosely. */
function Sun() {
  const light = useRef<DirectionalLight>(null)
  const target = useMemo(() => new Object3D(), [])
  const scope = useWard((s) => s.scope)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const l = light.current
    if (!l) return
    const c = middle(scope)
    const whole = scope === HOSPITAL
    const level = scopeLevel(scope) !== undefined
    target.position.set(c.x, c.y, c.z)
    l.target = target
    const [dx, dy, dz] = whole ? [60, 260, 90] : level ? [40, 110, 60] : [22, 42, 30]
    l.position.set(c.x + dx, c.y + dy, c.z + dz)
    const cam = l.shadow.camera
    ;[cam.left, cam.right, cam.top, cam.bottom, cam.far] = whole ? [-190, 190, 190, -190, 700] : level ? [-130, 130, 70, -70, 300] : [-44, 44, 32, -32, 120]
    cam.updateProjectionMatrix()
    markShadows()
    invalidate()
  }, [scope, target, invalidate])
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={10}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
    </>
  )
}

/** A drafting grid under the floor on show, or under the whole tower. */
function Ground() {
  const scope = useWard((s) => s.scope)
  const c = middle(scope)
  const whole = scope === HOSPITAL
  const wide = whole || scopeLevel(scope) !== undefined
  return (
    <Grid
      // Under a plate the grid drops below it, or the two would share a height.
      position={[c.x, c.y - (wide ? 0.5 : 0.01), c.z]}
      args={[300, 300]}
      cellSize={wide ? 4 : 1}
      cellThickness={0.6}
      cellColor="#d3d9e0"
      sectionSize={wide ? 20 : 5}
      sectionThickness={1}
      sectionColor="#bac3cd"
      fadeFrom={0}
      fadeDistance={whole ? 900 : wide ? 420 : 78}
      fadeStrength={2}
      infiniteGrid
    />
  )
}

function ShadowOnDemand() {
  const gl = useThree((s) => s.gl)
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
  }, [gl])
  useFrame(() => {
    if (takeShadowFlag()) gl.shadowMap.needsUpdate = true
  }, -2)
  return null
}

export default function Scene() {
  const level = useQuality((s) => s.level)
  const lost = useQuality((s) => s.lost)
  // The opening shot looks straight down on the wing it opens on.
  const start = useMemo(() => middle(useWard.getState().scope), [])
  return (
    <Canvas
      frameloop="demand"
      flat
      shadows="percentage"
      dpr={dprFor(START)}
      camera={{ fov: 35, near: 0.5, far: 2400, position: [start.x, start.y + 150, start.z + 0.5] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      aria-label="3D model of the hospital"
      // Half-resolution AO smears the first rows of pixels; the canvas starts above the stage so they stay hidden.
      style={{ position: 'absolute', inset: '-8px 0 0 0', height: 'auto' }}
    >
      <color attach="background" args={['#e8ecf0']} />
      <hemisphereLight args={['#ffffff', '#cdd4dc', 1.35]} />
      <Sun />
      <ShadowOnDemand />
      <Ground />
      <Shell />
      <Corridors />
      <Floors />
      <Beds />
      <Equipment />
      <Overlays />
      <Route />
      <TagTracker />
      <CameraRig />
      {/* Effects can arrive after the context is lost, and a composer set up on a lost context throws; the rebuilt canvas mounts them. */}
      {level >= 2 && !lost && (
        <Suspense fallback={null}>
          <Effects smaa={level >= 3} />
        </Suspense>
      )}
      <AdaptiveQuality />
      <ContextWatch />
      {stats && <FrameMeter />}
    </Canvas>
  )
}
