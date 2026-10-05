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

## Phase 4: operations

What makes it a tool an operator could work in, not only watch.

### 4.1 Alert handling
- Acknowledge an alert, then send it to the team that owns it: nursing, housekeeping, facilities or bed management. Each alert keeps a log: opened, acknowledged, sent, cleared.
- Clearing stays with the data. An alert clears when its condition ends, as alarm-management standards (ISA-18.2) have it; an operator acknowledges, and cannot close a warm room with a button.
- Actions are part of the day, stamped with the minute they were taken, so scrubbing back before an acknowledgement shows the alert new again.
- Live: actions travel over the feed. The server logs them as events, so every screen on the feed sees them and a reconnect catches up; an action taken offline waits in an outbox and is sent once, by its id, when the connection is back.
- The embed reports each alert's handling.
- **Done when:** an alert can be acknowledged and sent from the panel, its log reads back at any minute without showing what comes later, an action taken during the demo's outage arrives after it, and a host page hears the handling.

### 4.2 A capacity forecast
- How many ward beds will be free over the next four hours, net of the patients waiting for one, with a range meant to hold four times in five.
- Made only from what is known at the minute: beds being turned over, discharges planned at the morning round, patients waiting, and the usual rate of admissions. Never from the simulated future.
- The simulation gains what a hospital would know: discharge plans and bed requests, drawn from a stream of their own so the replayed day stays as it was.
- A backtest makes the forecast at every half hour of the day in every wing and measures how often the range held and how far its middle was off.
- **Done when:** every overview shows the next four hours, the backtest runs in the unit tests, and the README and the making-of quote its numbers.

## Phase 5: integration

What it takes to connect a real hospital.

### 5.1 An integration server, fed over MQTT
- The hospital's systems as they talk in practice: building sensors, bed status, nurse call, location tags and patient flow each publish small JSON messages on MQTT topics. The contract is written down, topic by topic.
- An integration server between them and the twin: it subscribes, turns messages into the feed's numbered events, serves the feed over WebSocket, and derives the alerts itself from the raw readings by the same rules, where the demo's mock copies them from the simulation. An operator's action is logged as before and dispatched back on MQTT to the team it was sent to.
- One command runs a whole simulated hospital: a broker, the devices replaying the day, and the server; the twin connects with `VITE_FEED_URL`, as a deployment would.
- **Done when:** the recorded day, published as device messages and passed through the server, comes out as exactly the recording's event log, alerts included; a test runs the broker, the server and a feed client end to end; the docs show how each real system maps onto a topic.

## Phase 6: a real building

So far the hospital is drawn from a plan written in code. A hospital's own buildings come as BIM models, in IFC.

The model: the Medical-Dental Clinic from buildingSMART's community samples, a real two-storey clinic with medical, dental and imaging rooms and a paediatric waiting area, redacted ("BSI (2020) Medical-Dental Test Files, buildingSMART International", https://github.com/buildingsmart-community/Community-Sample-Test-Files, CC BY 4.0: free to copy and change, crediting the source and saying what was changed). Its architectural file is 13 MB of IFC 2x3.

### 6.1 An IFC importer
- A command that reads an IFC file at build time (web-ifc, in Node; nothing of it ships to the page) and writes a compact building file: storeys, every space with its name, kind and floor outline, and the doors between spaces.
- The IFC file stays out of the repository; the building file carries the attribution and what was changed.
- **Done when:** the clinic imports with one command, and a test checks the spaces per storey and their areas against the IFC's own figures.

### 6.2 The clinic in the twin
- `?building=clinic` opens the imported clinic: its rooms drawn from their outlines, walls and doors, in 3D, in plan and in the list view, with picking, tags and the keyboard.
- The layers read a simulated day for the clinic's own rooms: exam and treatment rooms turning over between patients, temperature and air, call lights. The alerts follow the same rules.
- The hospital stays as it is; the clinic is a second building beside it, labelled as a real plan with simulated data.
- **Done when:** the clinic opens from a link, every layer and view works on it, and the first load and the hospital's numbers are unchanged.

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
- [x] 4.1 Alert handling: acknowledge, then send to the owning team, with a log in each room that reads back at any minute and says when an alert cleared unseen; actions through the feed with an outbox that survives the demo's outage, logged once by id; `acknowledged` and `sentTo` in the embed's alerts; decision 12
- [x] 4.2 A capacity forecast: ward beds four hours ahead in every overview, as a likely value and a range, from plans, requests and turnover the simulation now records, identical when built from the live feed; the backtest holds the range 93.6 % of the time per wing four hours ahead and 80.0 % for the hospital over twelve other days, `npm run backtest`; decision 13
- [x] 5.1 An integration server, fed over MQTT: one topic per room, asset and flow (`src/integration/topics.ts`), a server that checks messages, works out every alert from raw data and serves the feed through the hub it shares with the mock; `npm run hospital` with `npm run dev:hospital`; the whole day as 1,005,153 device messages comes out as exactly the recording's 21,904 events with all 881 alerts; an end-to-end test with a broker, the server, a screen and a team; QoS 1 after QoS 0 lost most of a burst; decision 14
- [x] 6.1 An IFC importer: `npm run ifc:import` reads the clinic's 13 MB IFC with web-ifc in Node and writes a 34 kB building file (gzipped): 259 rooms on two floors with their outlines, names, OmniClass kinds and stated areas, 1,297 wall footprints and 247 doors with the rooms they join; every room's area within 10 % of the model's own figure once the walls it is measured to are counted, all but one within 5 %; re-importing gives the committed file; the IFC stays out of the repository, docs/buildings.md says where to fetch it; decision 15
- [x] 6.2 The clinic in the twin: `?building=clinic`, linked from the hospital's overviews, in 3D, plan and list, both floors side by side or one at a time, with the four layers, picking, tags, links, playback and Arabic; a simulated clinic day on its own rooms, its alerts by the hospital's rules; the hospital's first load went from 90.9 kB to 89.7 kB, as a room's details now load after the first paint, and the clinic adds 11.5 kB and its 34 kB plan
