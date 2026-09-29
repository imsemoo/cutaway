# 3. Simulate the day in a Web Worker, the opening wing first

## Context

The simulated day for the whole hospital takes 0.6 to 0.75 s in the browser. Computed on the main thread it would hold the first frame back; computed in one piece, even in a worker, a link to one wing would wait for all 36.

## Decision

The day is simulated in a Web Worker from a fixed seed, each wing from its own, so one wing's day never shifts another's. The worker posts the wing the page opens on first, then the whole hospital. Views check whether the day in hand covers what they show before they draw it.

## Consequences

- The opening wing arrives in 25 to 29 ms, and the scene's first frame never waits on the simulation.
- Every visitor replays the same day, which is what lets the case study and the tests quote it.
- A level or the whole hospital shows a skeleton until the full day arrives, under a second later.
- The story wing, 4A, keeps a scripted afternoon on top of its seed; the others draw their discharges, admissions and faults at random.
