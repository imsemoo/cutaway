# 6. Wayfinding with Dijkstra over a walking graph

## Context

From a bed, a nurse asks where the nearest free infusion pump is. There are hundreds of pumps in the hospital, many of them free at a given minute, and nearest means quickest to reach on foot, not closest in a straight line.

## Decision

The building is a graph: every room and its door, stops along both corridors of every wing, the crossing through the core, the glazed links between wings and rows, and every lift. Costs are seconds: walking at 1.2 m/s, and a lift as a wait plus a few seconds a floor. One Dijkstra search from the room reaches every free piece of the kind at once, and the first one it reaches is the answer.

## Consequences

- A* would need a search per candidate; Dijkstra answers the whole question in one.
- The graph has 4,296 nodes and is built once in under 10 ms; a search takes 2 to 11 ms.
- A lift counts in time but not in metres, so the panel can say 87 m and about a minute and mean both.
- The search loads on the first request, as its own 1.4 kB file.
