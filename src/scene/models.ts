import { useEffect, useState } from 'react'
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, MeshStandardMaterial, type Mesh } from 'three'
import type { AssetKind } from '../data/types'
import { assetGeometry } from './geometry'

export type ModelName = 'bed' | 'occupant' | 'roomKit' | AssetKind
export type Models = Record<ModelName, BufferGeometry>

let loading: Promise<Models> | null = null

/**
  A quantised glTF mesh as plain float attributes in world units: the
  dequantising node transform is baked in, so the geometry can go straight
  into an InstancedMesh.
*/
function toFloat(mesh: Mesh): BufferGeometry {
  mesh.updateWorldMatrix(true, false)
  const src = mesh.geometry
  const out = new BufferGeometry()
  for (const [name, attr] of Object.entries(src.attributes)) {
    const n = attr.count
    const size = attr.itemSize
    const arr = new Float32Array(n * size)
    const read = [attr.getX, attr.getY, attr.getZ, attr.getW]
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = read[k].call(attr, i)
    out.setAttribute(name, new BufferAttribute(arr, size))
  }
  if (src.index) out.setIndex(src.index.clone())
  out.applyMatrix4(mesh.matrixWorld)
  out.computeBoundingSphere()
  return out
}

/**
  ward.glb, built by `npm run models`: eight meshopt-compressed models in one
  request. The loader and decoder are fetched with it, after the first frame,
  so the scene opens on the proxies and the detail arrives on its own.
*/
export function loadModels(): Promise<Models> {
  loading ??= Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')])
    .then(([{ GLTFLoader }, { MeshoptDecoder }]) =>
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${import.meta.env.BASE_URL}models/ward.glb`),
    )
    .then((gltf) => {
      const out: Partial<Models> = {}
      gltf.scene.traverse((o) => {
        if ((o as Mesh).isMesh) out[o.name as ModelName] = toFloat(o as Mesh)
      })
      return out as Models
    })
  return loading
}

/** The detailed models once they have loaded; null until then, and the proxies stand in. */
export function useModels() {
  const [models, setModels] = useState<Models | null>(null)
  useEffect(() => {
    let alive = true
    loadModels()
      .then((m) => alive && setModels(m))
      .catch(() => undefined) // the proxies stay: a missing model file never breaks the scene
    return () => {
      alive = false
    }
  }, [])
  return models
}

/* ---------------- proxies: what stands in at overview distance ---------------- */

function paint(g: BufferGeometry, hex: number, tint: boolean) {
  const geo = g.index ? g.toNonIndexed() : g
  const n = geo.attributes.position.count
  const c = new Color(hex)
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) color.set([c.r, c.g, c.b], i * 3)
  geo.setAttribute('color', new BufferAttribute(color, 3))
  geo.setAttribute('_tint', new BufferAttribute(new Float32Array(n).fill(tint ? 1 : 0), 1))
  return geo
}

let proxies: Partial<Models> | null = null
let boxes: Record<AssetKind, BufferGeometry> | null = null
let material: MeshStandardMaterial | null = null
export const getProxies = () => (proxies ??= makeProxies())
/** At the distance of the hospital view equipment is a few pixels: a box each, twelve triangles, still in its status colour. */
export const getBoxes = () =>
  (boxes ??= {
    pump: paint(new BoxGeometry(0.3, 1.5, 0.3).translate(0, 0.75, 0), 0xffffff, true),
    vent: paint(new BoxGeometry(0.55, 1.2, 0.5).translate(0, 0.6, 0), 0xffffff, true),
    chair: paint(new BoxGeometry(0.6, 0.9, 0.6).translate(0, 0.45, 0), 0xffffff, true),
    xray: paint(new BoxGeometry(0.7, 2, 1).translate(0, 1, 0), 0xffffff, true),
    scanner: paint(new BoxGeometry(0.3, 1.1, 0.3).translate(0, 0.55, 0), 0xffffff, true),
  })
export const getMaterial = () => (material ??= tintMaterial())

function makeProxies(): Partial<Models> {
  return {
    bed: paint(new BoxGeometry(1.0, 0.55, 2.1).translate(0, 0.275, 0), 0xe4e8ed, false),
    occupant: paint(new BoxGeometry(0.94, 0.14, 1.36).translate(0, 0.62, 0.22), 0xffffff, true),
    pump: paint(assetGeometry('pump'), 0xffffff, true),
    vent: paint(assetGeometry('vent'), 0xffffff, true),
    chair: paint(assetGeometry('chair'), 0xffffff, true),
    xray: paint(assetGeometry('xray'), 0xffffff, true),
    scanner: paint(assetGeometry('scanner'), 0xffffff, true),
  }
}

/* ---------------- one material for every model ---------------- */

/*
  Vertex colours carry each part's own colour. The per-instance colour
  (a patient's acuity, a pump's status) applies only where the _tint
  attribute is 1, so a pump's housing turns amber while its pole stays steel.
*/
const COLOR_VERTEX = /* glsl */ `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
  vColor *= color;
#elif defined( USE_COLOR )
  vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, _tint );
#endif
`

export function tintMaterial() {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 })
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float _tint;')
      .replace('#include <color_vertex>', COLOR_VERTEX)
  }
  m.customProgramCacheKey = () => 'ward-tint'
  return m
}
