import { Color, DataTexture, FloatType, MeshStandardMaterial, NearestFilter, RedFormat, Vector2, Vector3 } from 'three'
import { ROOMS, WINGS } from '../data/floorplan'
import type { Day, Layer, Room } from '../data/types'
import { sample } from '../lib/query'
import { AIR, TEMP, along, type Ramp } from './ramp'

/*
  Temperature and air in the corridors. A room shows its own sensor, flat:
  walls keep one room's air from another's, so blending readings through
  them would invent data. The corridors have no sensors, so their floor is
  estimated in the fragment shader from the doors that open onto them,
  weighted by distance and by how wide each door is.

  Every wing is built to one plan, so its doors sit at the same places in
  the wing's own coordinates: one uniform array serves all 36. The readings
  live in a small float texture, a row per wing and a texel per room, in
  the order of ROOMS; a fragment reads only its own wing's row.
*/

const PLAN = WINGS[0]
const PER_WING = PLAN.rooms.length

/** Where each door opens onto a corridor, in the wing's own coordinates, and how wide it is. */
export const DOORS = PLAN.rooms.map((r) => {
  // Every room has one; field.test.ts holds the plan to that.
  const { side, at, width } = r.door!
  const x = side === 'w' ? r.x : side === 'e' ? r.x + r.w : r.x + at
  const z = side === 'n' ? r.z : side === 's' ? r.z + r.d : r.z + at
  return { at: new Vector2(x - PLAN.x, z - PLAN.z), width }
})

/** A room's texel: ROOMS runs wing by wing, each in the plan's order. */
const TEXEL = new Map(ROOMS.map((r, n) => [r.id, n]))
export const ROW = new Map(WINGS.map((w, i) => [w.code, i]))

/** The layers with a corridor field, and the step between their isolines: half a degree, 100 ppm. */
const FIELDS: Partial<Record<Layer, { ramp: Ramp; step: number }>> = {
  temp: { ramp: TEMP, step: 0.5 },
  air: { ramp: AIR, step: 100 },
}

const FLOOR = '#f8f9fa'
const INK = new Color('#2a3441')

const VERTEX_PARS = /* glsl */ `
attribute float aRow;
varying vec2 vLocal;
varying float vRow;
`
// The footprint is modelled in the wing's own coordinates, so its position is already where the doors are.
const VERTEX = /* glsl */ `
vLocal = position.xz;
vRow = aRow;
`
const FRAGMENT_PARS = /* glsl */ `
uniform float uField;
uniform sampler2D uReadings;
uniform vec3 uDoors[ DOORS ];
uniform vec3 uStops[ 3 ];
uniform float uStep;
uniform float uLimit;
uniform vec3 uInk;
varying vec2 vLocal;
varying float vRow;
`
/*
  Inverse distance weighting, squared, each door counted by its width: a
  wide opening moves more air. Readings are 0 to 1 along the ramp. Isolines
  every step, and a darker line at the alert limit, fade out with distance
  before they crowd into a moire.
*/
const FRAGMENT = /* glsl */ `
if ( uField > 0.5 ) {
  float num = 0.0;
  float den = 0.0;
  int row = int( vRow + 0.5 );
  for ( int i = 0; i < DOORS; i ++ ) {
    vec2 d = vLocal - uDoors[ i ].xy;
    float w = uDoors[ i ].z / ( dot( d, d ) + 0.3 );
    num += w * texelFetch( uReadings, ivec2( i, row ), 0 ).r;
    den += w;
  }
  float v = clamp( num / max( den, 1e-6 ), 0.0, 1.0 );
  vec3 heat = v < 0.5 ? mix( uStops[ 0 ], uStops[ 1 ], v * 2.0 ) : mix( uStops[ 1 ], uStops[ 2 ], v * 2.0 - 1.0 );

  float f = v / uStep;
  float fw = max( fwidth( f ), 1e-4 );
  float iso = ( 1.0 - smoothstep( 0.5, 1.5, abs( fract( f + 0.5 ) - 0.5 ) / fw ) ) * ( 1.0 - smoothstep( 0.12, 0.35, fw ) );
  float lw = max( fwidth( v ), 1e-5 );
  float limit = ( 1.0 - smoothstep( 0.8, 1.8, abs( v - uLimit ) / lw ) ) * ( 1.0 - smoothstep( 0.03, 0.08, lw ) );
  diffuseColor.rgb = mix( heat, uInk, max( iso * 0.2, limit * 0.6 ) );
}
`

/** The corridor floor's material, and the handle that switches its field on and feeds it readings. */
export function corridorMaterial() {
  const readings = new DataTexture(new Float32Array(PER_WING * WINGS.length), PER_WING, WINGS.length, RedFormat, FloatType)
  readings.magFilter = readings.minFilter = NearestFilter
  const uniforms = {
    uField: { value: 0 },
    uReadings: { value: readings },
    uDoors: { value: DOORS.map((d) => new Vector3(d.at.x, d.at.y, d.width)) },
    uStops: { value: TEMP.stops.map((c) => c.clone()) },
    uStep: { value: 1 },
    uLimit: { value: 2 },
    uInk: { value: INK },
  }
  const material = new MeshStandardMaterial({ color: FLOOR, roughness: 1 })
  material.defines = { DOORS: DOORS.length }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT}`)
  }
  material.customProgramCacheKey = () => 'ward-corridor-field'

  /** Estimates the corridors of the given rooms' wings for a layer, or turns the field off for a flat one. */
  const show = (day: Day | null, t: number, layer: Layer, rooms: readonly Room[]) => {
    const field = FIELDS[layer]
    uniforms.uField.value = field && day ? 1 : 0
    if (!field || !day) return
    const { ramp, step } = field
    const data = readings.image.data as Float32Array
    for (const r of rooms) {
      const env = day.rooms[r.id]
      // A room without readings yet stands in at the middle of the ramp.
      data[TEXEL.get(r.id)!] = env ? along(ramp, sample(layer === 'temp' ? env.temp : env.co2, t)) : 0.5
    }
    readings.needsUpdate = true
    ramp.stops.forEach((c, k) => uniforms.uStops.value[k].copy(c))
    uniforms.uStep.value = step / (ramp.hi - ramp.lo)
    uniforms.uLimit.value = along(ramp, ramp.limit)
  }
  const dispose = () => {
    material.dispose()
    readings.dispose()
  }
  return { material, show, dispose }
}
