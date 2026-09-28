import { Grid } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, lazy, useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type DirectionalLight } from 'three'
import { FLOOR } from '../data/floorplan'
import { Beds } from './Beds'
import { CameraRig } from './CameraRig'
import { Equipment } from './Equipment'
import { Floors } from './Floors'
import { FrameMeter } from './FrameMeter'
import { Overlays } from './Overlays'
import { Shell } from './Shell'
import { takeShadowFlag } from './shadows'

// Phones and small screens skip ambient occlusion and render at a lower pixel ratio.
const lite = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || window.innerWidth < 760)
const stats = typeof window !== 'undefined' && new URLSearchParams(location.search).has('stats')
const Effects = lazy(() => import('./Effects'))

function Sun() {
  const light = useRef<DirectionalLight>(null)
  const target = useMemo(() => {
    const o = new Object3D()
    o.position.set(FLOOR.w / 2, 0, FLOOR.d / 2)
    return o
  }, [])
  useLayoutEffect(() => {
    if (light.current) light.current.target = target
  }, [target])
  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        position={[FLOOR.w / 2 + 22, 42, FLOOR.d / 2 + 30]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-44}
        shadow-camera-right={44}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-near={10}
        shadow-camera-far={120}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
    </>
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
  return (
    <Canvas
      frameloop="demand"
      flat
      shadows="percentage"
      dpr={[1, 1.5]}
      camera={{ fov: 35, near: 0.5, far: 600, position: [FLOOR.w / 2, 150, FLOOR.d / 2 + 0.5] }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      aria-label="3D model of the ward floor"
      // Half-resolution AO smears the first rows of pixels; the canvas starts above the stage so they stay hidden.
      style={{ position: 'absolute', inset: '-8px 0 0 0', height: 'auto' }}
    >
      <color attach="background" args={['#e8ecf0']} />
      <hemisphereLight args={['#ffffff', '#cdd4dc', 1.35]} />
      <Sun />
      <ShadowOnDemand />
      <Grid
        position={[FLOOR.w / 2, -0.01, FLOOR.d / 2]}
        args={[300, 300]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#d3d9e0"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#bac3cd"
        fadeFrom={0}
        fadeDistance={78}
        fadeStrength={2}
        infiniteGrid
      />
      <Shell />
      <Floors />
      <Beds />
      <Equipment />
      <Overlays />
      <CameraRig />
      {!lite && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
      {stats && <FrameMeter />}
    </Canvas>
  )
}
