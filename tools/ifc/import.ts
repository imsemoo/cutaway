/*
  Reads a building from an IFC file and writes it in Cutaway's building
  format (src/data/building.ts).

    npm run ifc:import -- tools/ifc/source/Clinic_Architectural.ifc public/buildings/clinic.json

  web-ifc parses the file and triangulates every element, in Node, at build
  time; the page never loads it. Rooms (IfcSpace) keep their number, name,
  OmniClass category and stated area, and their floor outline is cut from
  their mesh; walls become footprints; doors take their place from their
  mesh and the rooms they join from the model's space boundaries. Roofs,
  voids and storeys with no rooms are left out.
*/
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import * as W from 'web-ifc'
import type { Building, BuildingSpace, SpaceKind } from '../../src/data/building'
import { area, footprint, labelPoint, type Mesh, type Pt } from './outline'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: npm run ifc:import -- <model.ifc> <building.json>')
  process.exit(1)
}

/** What each OmniClass room category is for, by the start of its code; the first match wins. */
const KINDS: [string, SpaceKind][] = [
  ['13-41 41', 'care'],
  ['13-51 31', 'waiting'],
  ['13-11 11 31', 'waiting'],
  ['13-85', 'circulation'],
  ['13-81 21 31', 'circulation'],
  ['13-15 11 34', 'staff'],
  ['13-51 11', 'staff'],
  ['13-11 21', 'staff'],
  ['13-11 11 17', 'staff'],
  ['13-41 11 41', 'staff'],
]
const SKIP = /^(ROOF|OPEN TO BELOW)$/

const bytes = readFileSync(input)
const api = new W.IfcAPI()
await api.Init()
const model = api.OpenModel(new Uint8Array(bytes))
const ids = (type: number) => {
  const v = api.GetLineIDsWithType(model, type)
  return Array.from({ length: v.size() }, (_, i) => v.get(i))
}
type Value = { value: unknown } | unknown
const val = <T,>(x: Value) => (x && typeof x === 'object' && 'value' in x ? x.value : x) as T

/** Every element's properties and quantities, by name. */
const props = new Map<number, Record<string, unknown>>()
for (const id of ids(W.IFCRELDEFINESBYPROPERTIES)) {
  const r = api.GetLine(model, id)
  const def = api.GetLine(model, val<number>(r.RelatingPropertyDefinition))
  for (const o of r.RelatedObjects) {
    const p = props.get(val<number>(o)) ?? {}
    for (const q of def.HasProperties ?? def.Quantities ?? []) {
      const line = api.GetLine(model, val<number>(q))
      p[val<string>(line.Name)] = val(line.NominalValue ?? line.AreaValue)
    }
    props.set(val<number>(o), p)
  }
}

/** The storey each element belongs to: rooms by aggregation, walls and doors by containment. */
const storeyOf = new Map<number, number>()
for (const id of ids(W.IFCRELAGGREGATES)) {
  const r = api.GetLine(model, id)
  for (const c of r.RelatedObjects) storeyOf.set(val<number>(c), val<number>(r.RelatingObject))
}
for (const id of ids(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
  const r = api.GetLine(model, id)
  for (const c of r.RelatedElements) storeyOf.set(val<number>(c), val<number>(r.RelatingStructure))
}

/** Each element's triangles in world space, y up, as web-ifc places them. */
function meshes(expressIds: number[]) {
  const out = new Map<number, Mesh[]>()
  api.StreamMeshes(model, expressIds, (flat) => {
    const list: Mesh[] = []
    const g = flat.geometries
    for (let i = 0; i < g.size(); i++) {
      const placed = g.get(i)
      const geometry = api.GetGeometry(model, placed.geometryExpressID)
      const v = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
      const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())
      const m = placed.flatTransformation
      const positions = new Float64Array((v.length / 6) * 3)
      for (let k = 0, o = 0; k < v.length; k += 6, o += 3) {
        const [x, y, z] = [v[k], v[k + 1], v[k + 2]]
        positions[o] = m[0] * x + m[4] * y + m[8] * z + m[12]
        positions[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
        positions[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
      }
      list.push({ positions, indices: Array.from(indices) })
      geometry.delete()
    }
    out.set(flat.expressID, list)
  })
  return out
}

// Storeys that hold rooms, from the ground up. A roof storey's plant room is left out with the roofs.
const ROOF = /roof/i
const allStoreys = ids(W.IFCBUILDINGSTOREY)
  .map((id) => ({ id, name: val<string>(api.GetLine(model, id).Name), elevation: val<number>(api.GetLine(model, id).Elevation) }))
  .sort((a, b) => a.elevation - b.elevation)

// Rooms.
const spaceIds = ids(W.IFCSPACE).filter((id) => !SKIP.test(val<string>(api.GetLine(model, id).LongName) ?? ''))
const spaceMeshes = meshes(spaceIds)
const kept = allStoreys.filter((s) => !ROOF.test(s.name) && spaceIds.some((id) => storeyOf.get(id) === s.id))
const storeyIndex = new Map(kept.map((s, i) => [s.id, i]))
const raw: BuildingSpace[] = []
/** Each kept room's IFC id, for the space boundaries that name it. */
const roomOf = new Map<number, string>()
for (const id of spaceIds) {
  const line = api.GetLine(model, id)
  const p = props.get(id) ?? {}
  const storey = storeyIndex.get(storeyOf.get(id) ?? -1)
  const [outline] = footprint(spaceMeshes.get(id) ?? [])
  if (storey === undefined || !outline) continue
  const category = `${p['Category Code'] ?? ''} ${p['Category Description'] ?? ''}`.trim()
  roomOf.set(id, val<string>(line.Name))
  raw.push({
    id: val<string>(line.Name),
    name: val<string>(line.LongName),
    category,
    kind: KINDS.find(([code]) => category.startsWith(code))?.[1] ?? 'support',
    storey,
    area: Number(p['Area'] ?? p['GSA BIM Area'] ?? Math.abs(area(outline))),
    outline,
    label: [0, 0],
  })
}

// Walls, by storey.
const wallIds = [...ids(W.IFCWALLSTANDARDCASE), ...ids(W.IFCWALL)].filter((id) => storeyIndex.has(storeyOf.get(id) ?? -1))
const wallMeshes = meshes(wallIds)
const walls = wallIds.flatMap((id) => footprint(wallMeshes.get(id) ?? []).map((outline) => ({ storey: storeyIndex.get(storeyOf.get(id)!)!, outline })))

// Doors: where they stand, and which rooms they join.
const doorIds = ids(W.IFCDOOR).filter((id) => storeyIndex.has(storeyOf.get(id) ?? -1))
const doorMeshes = meshes(doorIds)
const joins = new Map<number, Set<string>>()
for (const id of ids(W.IFCRELSPACEBOUNDARY)) {
  const b = api.GetLine(model, id)
  const room = roomOf.get(val<number>(b.RelatingSpace))
  const element = val<number>(b.RelatedBuildingElement)
  if (room && doorMeshes.has(element)) joins.set(element, (joins.get(element) ?? new Set()).add(room))
}
const rawDoors = doorIds.flatMap((id) => {
  const xs: number[] = []
  const zs: number[] = []
  for (const m of doorMeshes.get(id) ?? []) {
    for (let i = 0; i < m.positions.length; i += 3) {
      xs.push(m.positions[i])
      zs.push(m.positions[i + 2])
    }
  }
  if (!xs.length) return []
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  return [{ storey: storeyIndex.get(storeyOf.get(id)!)!, at: [(x0 + x1) / 2, (z0 + z1) / 2] as Pt, width: Math.max(x1 - x0, z1 - z0), spaces: [...(joins.get(id) ?? [])].sort() }]
})

// The building's corner at the origin, everything to the centimetre.
const every = [...raw.flatMap((s) => s.outline), ...walls.flatMap((w) => w.outline)]
const [minX, minZ] = [Math.min(...every.map((p) => p[0])), Math.min(...every.map((p) => p[1]))]
const cm = (n: number) => Math.round(n * 100) / 100
const place = (p: Pt): Pt => [cm(p[0] - minX), cm(p[1] - minZ)]
const spaces: BuildingSpace[] = raw
  .map(({ outline, ...s }) => {
    const placed = outline.map(place)
    return { ...s, area: cm(s.area), outline: placed, label: labelPoint(placed).map(cm) as Pt }
  })
  .sort((a, b) => a.storey - b.storey || a.id.localeCompare(b.id))

const building: Building = {
  name: 'Medical-Dental Clinic',
  source: {
    title: 'Medical-Dental Clinic, architectural model (IFC 2x3)',
    credit: 'BSI (2020) "Medical-Dental Test Files," buildingSMART International',
    url: 'https://github.com/buildingsmart-community/Community-Sample-Test-Files',
    license: 'CC BY 4.0',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    changes:
      'Converted from IFC to Cutaway\'s building format by tools/ifc/import.ts: the storeys with rooms; each room\'s number, name, OmniClass category, stated area and floor outline; wall footprints; and doors with the rooms they join. Geometry rounded to the centimetre and moved to start at the origin. Roofs, voids and the roof storey left out. Everything that happens in it in Cutaway is simulated.',
  },
  // A storey is as tall as the gap to the next one up, the roof's included.
  storeys: kept.map((s) => ({ name: s.name, elevation: cm(s.elevation), height: cm(allStoreys[allStoreys.indexOf(s) + 1].elevation - s.elevation) })),
  spaces,
  walls: walls.map((w) => ({ storey: w.storey, outline: w.outline.map(place) })).filter((w) => Math.abs(area(w.outline)) > 0.005),
  doors: rawDoors.map((d) => ({ ...d, at: place(d.at), width: cm(d.width) })),
  size: { w: cm(Math.max(...every.map((p) => p[0])) - minX), d: cm(Math.max(...every.map((p) => p[1])) - minZ) },
}
api.CloseModel(model)

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(building))
const kinds = Object.fromEntries(['care', 'waiting', 'circulation', 'staff', 'support'].map((k) => [k, spaces.filter((s) => s.kind === k).length]))
console.log(
  `${output}: ${building.storeys.length} storeys, ${spaces.length} rooms ${JSON.stringify(kinds)}, ${building.walls.length} wall footprints, ${building.doors.length} doors, ${building.size.w} × ${building.size.d} m, ${(JSON.stringify(building).length / 1000).toFixed(0)} kB`,
)
