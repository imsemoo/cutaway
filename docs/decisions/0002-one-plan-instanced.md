# 2. One wing plan, instanced across the hospital

## Context

The hospital has 36 wings on six levels. Drawn as separate meshes, each wing's walls, glass, counters, floors and beds would cost thousands of draw calls, and the whole hospital would not hold a frame rate on an integrated GPU.

## Decision

Every wing is built to one plan. Each part of the shell is one instanced mesh for all 36 wings, the 1,368 room floors are one more, and beds and equipment are instances of a few glTF models. Only the wings in scope are packed into the instances drawn, and the mesh's `count` stops there, so a wing out of view is not drawn at all. Far from the camera, equipment switches to plain boxes.

## Consequences

- The whole hospital draws in 33 draw calls, fewer than one wing seen up close (48).
- Packing by scope was not the first version. Hiding the other wings still sent them to the GPU: 207,500 triangles for a one-wing view. Packed, the same view draws 15,000.
- Every wing has to match the plan room for room. A unit test holds them to it, because the corridor field (decision 7) and the wayfinding graph (decision 6) rely on it too.
- A hospital whose wings differ would need one instanced mesh per distinct plan, not per wing.
