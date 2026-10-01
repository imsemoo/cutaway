# Roadmap

Cutaway is a concept, and it stays labelled as one. This roadmap is for the next stage: from a convincing demo to work that holds up when a technical lead opens the demo, reads the code and checks the numbers.

## Principles

- **Every feature earns its place.** It answers something a hospital operator or a hiring engineer would actually look for. Nothing is added for decoration.
- **Measure before claiming.** Every number in the README or the case study comes from a run that can be repeated: the frame meter (`?stats`), the build output, or a test.
- **Honest labels.** The data is simulated and the product is a concept. The page, the README and the case study say so.
- **Keep what works.** On-demand rendering, instancing, the worker and the deep links are the base; new work builds on them rather than replacing them.

## Phase 1: credibility

What a reviewer sees in the first two minutes.

### 1.1 Tests and CI
- Unit tests (Vitest) for the simulation and the queries:
  - the same seed gives the same day;
  - every bed has exactly one state at every minute;
  - alerts open and close where their rules say;
  - the replay minute never leaks the future into alert text.
- End-to-end tests (Playwright, real WebGL through SwiftShader):
  - a shared link opens the right room, with its tag;
  - layers switch;
  - list view and search work;
  - no console errors.
- A lint pass (ESLint with the React hooks rules).
- A CI workflow that type-checks, lints, tests, builds and enforces a bundle budget before every deploy. A failing check blocks the deploy.
- **Done when:** the README shows a passing CI badge and a `npm test` run is green locally and on GitHub.

### 1.2 Real assets through a glTF pipeline
- Beds, the five kinds of equipment, and bedside furniture (cabinet, overbed table, visitor chair) are modelled as parametric code.
- The models export to glTF, get compressed with meshopt and quantised, and are loaded at runtime with the meshopt decoder.
- A two-level LOD: 12-triangle proxies at overview distance, the detailed models once the camera comes in.
- One draw call per model kind is kept. The detailed models carry per-part colours in vertex colours, and a small shader patch tints only the parts that show state, such as the blanket or a pump's body.
- **Done when:** a close-up reads as a hospital room rather than boxes, the pipeline runs with one command, and the case study states the model sizes and triangle counts.

### 1.3 Resilience on real hardware
- Adaptive quality: a performance monitor steps the pixel ratio and ambient occlusion down on a device that struggles, and back up when it recovers.
- WebGL context loss: the scene says it has paused and restores itself, rather than freezing.
- A test on a real low-end Android phone and an iPhone.
- **Done when:** the frame meter holds its rate on the laptop with the new models, context loss recovers in a test, and the phone results are recorded.

### 1.4 A film
- A 45-second screen recording of the real demo, covering the opening shot, layers, a room, the timeline and plan view.
- A short loop in the README.
- **Done when:** the case study opens on the film, like the other cases in the portfolio.

## Phase 2: depth

What shows platform thinking.

### 2.1 Live mode
- A real-time event stream (a mock WebSocket feed) with connection status, reconnect with backoff, and buffering.
- A Live / Replay switch.
- A documented adapter interface, so a real source (BMS sensors, RTLS tags, an ADT feed) plugs in without touching the scene.

### 2.2 A whole hospital
- Six floors stacked, with a floor switcher and an exploded view.
- More than 1,000 rooms and 3,000 tracked assets.
- The same rendering budget: frame rate and draw calls published at that scale.

### 2.3 Wayfinding
- "Nearest free infusion pump": a shortest-path search over the corridor graph, an animated route on the floor, and a walking-time estimate.
- Built with Dijkstra rather than A*: the question has many candidate pumps, and one search from the room reaches them all.

### 2.4 Sensor heatmaps in a shader
- Temperature and CO₂ fields interpolated across the floor from sensor points in GLSL, in place of one flat colour per room.
- Built differently: interpolating through walls would invent readings, since walls keep one room's air from another's. Rooms keep their own sensor's colour; the corridors, which have no sensors, are estimated from the doors that open onto them.

## Phase 3: positioning

### 3.1 Arabic, right to left
A complete Arabic interface with a language switch, since a right-to-left digital twin is rare.
- Built: English keys through `say()`, a lazy Arabic catalogue held complete by a test, Arabic plurals, Vazirmatn chosen by comparison, a mirrored layout with time and scales left to right, and Arabic room names on the floors.

### 3.2 Architecture notes
An architecture page and short decision records, plus a "making of" write-up with the measured before-and-after numbers.
- Built: docs/architecture.md with a diagram of the data flow and a map of what loads when, nine decision records, and docs/making-of.md.

### 3.3 Embed API
A `<cutaway-twin>` web component and a postMessage API, so a host dashboard can select rooms and listen to alerts.

### 3.4 Accessibility
- Keyboard navigation between rooms in the 3D view.
- Alerts announced in a live region.
- axe-core checks in CI.

## Status

- [x] 1.1 Tests and CI: 23 unit tests, 8 browser tests at two sizes, lint, types and a bundle budget, all gating the deploy, green on GitHub.
- [x] 1.2 Real assets through a glTF pipeline: 8 models, 17,208 triangles, 129 KB, per-instance LOD, stated in the case study.
- [ ] 1.3 Resilience on real hardware: adaptive quality and context-loss recovery are done and tested; the real-phone test still needs a device
- [x] 1.4 A film: captured on a controlled clock, with a loop in the README; the case study opens on it. Re-recorded at 40 seconds for the hospital and wayfinding.
- [x] 2.1 Live mode: a mock server streams the day over the feed protocol; resume by sequence number, backoff with jitter, a silence watchdog and one render per frame; `?mode=live`; the protocol in docs/live-feed.md
- [x] 2.2 A whole hospital: six levels of six wings, 1,368 rooms, 1,008 beds and 3,006 tracked assets; an exploded view, a view of each level with its wings joined by glazed links, a building map and a trail back up; the whole hospital in 33 draw calls at 72 to 90 fps on an integrated GPU
- [x] 2.3 Wayfinding: the nearest free pump, wheelchair, scanner or ventilator from any bed, by walking time across wings, rows and lifts, drawn on the floors
- [x] 2.4 Sensor heatmaps in a shader: corridors estimated in the fragment shader from the rooms' doors, with isolines and the alert limit; rooms keep their own readings
- [x] 3.1 Arabic, right to left: the whole interface, the alerts and the floor labels, mirrored where Arabic reads that way; the first load stays at 90 kB
- [x] 3.2 Architecture notes: an architecture page, nine decision records, and a making-of with the numbers before and after each change
- [x] 3.3 Embed API: `<cutaway-twin>` in a 1 kB `embed.js`, a postMessage protocol in the link's own words, origin-locked after a handshake; a demo host page at /host/; docs/embed.md and decision 10
- [x] 3.4 Accessibility: the model as one keyboard widget (arrow keys by screen direction, Enter, Escape, each move said aloud), alerts said as they open, axe-core checks of eight views at two sizes in CI; decision 11. Not yet tried with a daily screen-reader user
