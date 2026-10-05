# 15. A real building, read from its IFC model at build time

## Context

The hospital is drawn from a plan written in code: every wing built to one plan, which is what lets 36 wings draw as instances ([decision 2](0002-one-plan-instanced.md)). A real hospital's buildings come as BIM models, most often in IFC, with every room, wall and door a building's architects drew, and no two floors alike. A twin that can only show a plan written for it cannot show a real one.

The sample: buildingSMART's Medical-Dental Clinic, a real two-storey clinic published for testing under CC BY 4.0. Its architectural file is 13 MB of IFC 2x3.

There were three ways to read it. web-ifc, a WebAssembly IFC parser, can run in the browser, but it is 1.6 MB of WebAssembly before the 13 MB file, and every visitor would parse and triangulate the whole model to draw a few hundred floor outlines. Exporting the model to glTF would keep its geometry but drop what the twin needs most: which room is which, its name, its category, and which doors join which rooms. IfcOpenShell would do the job in Python, outside the project's toolchain.

## Decision

`tools/ifc/import.ts` reads the IFC with web-ifc in Node, at build time, and writes a compact building file (`src/data/building.ts`): storeys; every room with its number, name, OmniClass category, stated area and floor outline; wall footprints; doors with the rooms they join. The outlines are cut from the rooms' own meshes, the boundary of each room's lowest face, so they follow the model however it was modelled. The page loads the 34 kB file, never the IFC and never web-ifc.

`?building=clinic` opens the twin on it as a page of its own (`src/clinic`): the floors drawn from their outlines, walls pulled up from their footprints, the same layers, views, alerts, charts, store and language as the hospital, and a simulated day on the clinic's own rooms. Its code loads only on that page.

## Consequences

- The file is checked against the model's own figures: a room's outline stops at its walls' faces and the model measures it to their middles, so the test adds half a wall around each and requires every room within 10 % of the model's area and almost all within 5 % ([buildings.md](../buildings.md)). Re-importing must give exactly the committed file.
- The clinic is not instanced: each floor is two meshes, every room's floor in one, coloured per room, and every wall in the other. It is 259 rooms; the hospital's 1,368 still use its plan.
- A room's kind, which decides how the simulation treats it, comes from its OmniClass code by a table. Another model classified another way needs its own table.
- Room names stay in the model's own words, in English, in both languages; the interface around them is translated.
- The clinic page shares modules with the hospital's entry, and the bundler cut more of them out into small chunks, which took the hospital's first load to 91.7 kB, over its budget. A room's and a piece of equipment's details then moved after the first paint, as the alert list had, since neither can show before the day arrives: 89.7 kB, below where it started.
- The IFC stays out of the repository; buildings.md says where to fetch it, with its checksum.
