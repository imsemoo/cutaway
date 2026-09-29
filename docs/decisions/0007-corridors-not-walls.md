# 7. Rooms keep their sensor; only the corridors are estimated

## Context

The roadmap asked for temperature and CO₂ as smooth fields across the floor, interpolated in a shader from sensor points, in place of one flat colour a room. Built that way, the first version blended each room's reading into its neighbours' through the walls, and drew a hot room as an oval that cooled towards its walls.

## Decision

Walls keep one room's air from another's, so blending through them invents readings. Each room keeps its own sensor's colour. The corridors, which have no sensors, are estimated in the fragment shader from the doors that open onto them, by inverse distance weighting, each door weighted by its width. Isolines mark every half degree or 100 ppm, a darker line marks the alert limit, and the key says the corridors are estimated.

## Consequences

- The floor never shows a reading no sensor took, and a warm room's heat still shows, spilling out of its door into the corridor.
- The readings are a 38 × 36 float texture, a row per wing, so a new minute uploads 1,368 numbers and no geometry.
- Switching the layer on costs 1 or 2 fps.
