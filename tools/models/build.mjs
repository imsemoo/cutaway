/*
  Build public/models/ward.glb from the parametric models in parts.mjs.

    npm run models

  Each model's parts are merged into one primitive with vertex colours
  (COLOR_0) and a tint mask (_TINT), so at runtime every model is a single
  instanced draw call. The file is welded, deduplicated, quantised and
  compressed with meshopt; the numbers go to tools/models/stats.json.
*/
import { Document, NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { BufferAttribute, Color } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { MODELS } from './parts.mjs'

const OUT = 'public/models/ward.glb'

/** Merge a model's parts into one geometry carrying colour and tint per vertex. */
function flatten(parts) {
  const c = new Color()
  const geos = parts.map(({ geometry, color, tint }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    g.deleteAttribute('uv')
    const n = g.attributes.position.count
    c.setHex(color) // linear, as glTF expects
    const col = new Float32Array(n * 3)
    const tin = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], i * 3)
      tin[i] = tint ? 1 : 0
    }
    g.setAttribute('color', new BufferAttribute(col, 3))
    g.setAttribute('_tint', new BufferAttribute(tin, 1))
    return g
  })
  return mergeGeometries(geos, false)
}

const doc = new Document()
const buffer = doc.createBuffer()
const scene = doc.createScene('ward')
const material = doc.createMaterial('ward').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.7).setMetallicFactor(0)
const stats = {}

for (const [name, make] of Object.entries(MODELS)) {
  const g = flatten(make())
  const acc = (attr, type) => doc.createAccessor().setArray(new Float32Array(attr.array)).setType(type).setBuffer(buffer)
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc(g.attributes.position, 'VEC3'))
    .setAttribute('NORMAL', acc(g.attributes.normal, 'VEC3'))
    .setAttribute('COLOR_0', acc(g.attributes.color, 'VEC3'))
    .setAttribute('_TINT', acc(g.attributes._tint, 'SCALAR'))
    .setMaterial(material)
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)))
  stats[name] = { triangles: g.attributes.position.count / 3 }
}

await MeshoptEncoder.ready
await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

for (const node of doc.getRoot().listNodes()) {
  const prim = node.getMesh().listPrimitives()[0]
  stats[node.getName()].vertices = prim.getAttribute('POSITION').getCount()
}

mkdirSync('public/models', { recursive: true })
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
await io.write(OUT, doc)

const bytes = statSync(OUT).size
const total = Object.values(stats).reduce((s, m) => s + m.triangles, 0)
writeFileSync('tools/models/stats.json', JSON.stringify({ file: OUT, bytes, triangles: total, models: stats }, null, 2) + '\n')
for (const [name, m] of Object.entries(stats)) console.log(`${name.padEnd(9)} ${String(m.triangles).padStart(6)} triangles ${String(m.vertices).padStart(6)} vertices`)
console.log(`${OUT}: ${(bytes / 1024).toFixed(1)} KB, ${total} triangles in ${Object.keys(stats).length} models`)
