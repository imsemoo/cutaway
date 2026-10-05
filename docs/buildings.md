# Buildings from BIM models

The hospital is drawn from a plan written in code (`src/data/floorplan.ts`). A real hospital's buildings come as BIM models in IFC, so Cutaway can also read one: `tools/ifc` turns an IFC file into a compact building file, and `?building=clinic` opens the twin on it ([decision 15](decisions/0015-a-real-building-read-at-build-time.md)).

## The clinic

The Medical-Dental Clinic from buildingSMART's community sample files: a real two-storey clinic with medical, dental and imaging rooms and a paediatric waiting area, published redacted for testing.

- Source: BSI (2020) "Medical-Dental Test Files," buildingSMART International, <https://github.com/buildingsmart-community/Community-Sample-Test-Files>
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): free to copy and change, crediting the source and saying what was changed. `public/buildings/clinic.json` carries the credit and the changes, and the clinic's panel shows them.
- The file: `IFC 2x3/Medical-Dental Clinic/Clinic_Architectural.ifc`, 13 MB, SHA-256 `2ac970ce065ecac4e0c9e5f453a257169e90d0067f419b7e33533a64ef837880`.

The IFC file stays out of the repository (`tools/ifc/source` is ignored). To fetch it:

```bash
mkdir -p tools/ifc/source
curl -L -o tools/ifc/source/Clinic_Architectural.ifc "https://media.githubusercontent.com/media/buildingsmart-community/Community-Sample-Test-Files/main/IFC%202.3.0.1%20(IFC%202x3)/Medical-Dental%20Clinic/Clinic_Architectural.ifc"
```

## Importing

```bash
npm run ifc:import -- tools/ifc/source/Clinic_Architectural.ifc public/buildings/clinic.json
```

web-ifc parses the file and triangulates every element in Node, at build time; nothing of it ships to the page. The importer writes, in the format of `src/data/building.ts`:

- **Storeys** with rooms, by name, elevation and height. The roof storey has none and is left out.
- **Rooms** (`IfcSpace`): the number, the name, the OmniClass category and the area the model states, and a floor outline cut from the room's mesh: the boundary of its lowest face's triangles, simplified, in centimetres. Roofs and "open to below" voids are left out. Each room gets a kind from the start of its OmniClass code (`care`, `waiting`, `circulation`, `staff` or `support`), which decides how the simulation treats it.
- **Walls** as footprints, cut from their meshes the same way.
- **Doors**, placed from their meshes, with the rooms they join from the model's space boundaries (`IfcRelSpaceBoundary`).

Everything is moved to start at the origin. The clinic comes out as 259 rooms on two floors (154 and 105), 1,297 wall footprints and 247 doors, 52.66 × 66.07 m; the file is 184 kB, 34 kB gzipped, and loads only on the clinic's page.

## Checks

`src/data/building.test.ts` checks the file against what the model itself states:

- the storeys and the rooms on each, every room once;
- every room's area. The model measures a room to the middle of its walls and the outline stops at their faces, so the outlines alone come out a median 7.6 % small. Counting half of a 12 cm wall around each, the median room is within 0.7 % of the model's figure, 81 % are within 2 %, all but one within 5 %, and none is off by more than 10 %;
- every label inside its room, and every door joining rooms on its own storey;
- the source and the license, stated.

`tools/ifc/import.test.ts` re-imports the IFC and requires exactly the committed file; it is skipped when the IFC has not been fetched.

## The clinic's day

`src/clinic/simulate.ts` simulates a day on the clinic's own rooms, from a fixed seed. It is replayed, or played live from a feed of the clinic's own: `?building=clinic&mode=live` opens it on the demo's mock server, or on the integration server with `VITE_CLINIC_FEED_URL` ([integration.md](integration.md), [decision 16](decisions/0016-a-feed-for-each-building.md)). Nothing in it is real patient data. The clinic opens at 07:30 and closes at 18:00; its care rooms see one patient after another and turn over between them; its waiting rooms fill in the late morning and mid-afternoon, and the larger ones' air grows stale; after lunch the cooling of the X-ray room, 2A12, fails until late in the afternoon; and at the afternoon rush one call light waits too long. The alerts come from the hospital's own rules (`src/sim/rules.ts`, `src/data/limits.ts`). `src/clinic/simulate.test.ts` checks that every minute of every care room is accounted for, that call lights ring only with a patient in, and that the afternoon is the one the overview describes.

## Another building

Any IFC 2x3 or IFC 4 model with spaces imports the same way. What decides how well:

- **Spaces.** Rooms are read from `IfcSpace`; a model without them has walls and nothing to colour.
- **Categories.** Kinds come from OmniClass Table 13 codes in the space's `Category` property. A model classified another way needs its own table in `tools/ifc/import.ts`; any room it misses counts as support.
- **Space boundaries.** Doors join rooms through `IfcRelSpaceBoundary`; without them, doors are drawn but join nothing.

The page reads `public/buildings/clinic.json` by name today; a second building would need its name in the link and its own simulated day, or a feed.
