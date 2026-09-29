# Ward Twin

[![Check and deploy](https://github.com/imsemoo/ward-twin/actions/workflows/deploy.yml/badge.svg)](https://github.com/imsemoo/ward-twin/actions/workflows/deploy.yml)

A concept digital twin of one hospital floor, in the browser. A 3D model of a 28-bed ward and ICU replays a simulated day, or follows it live from a streaming feed: beds turning over from occupied to cleaning to ready, a room warming up through an HVAC fault, call lights waiting too long at shift change, and equipment moving between rooms.

Everything on screen is simulated. There is no real hospital, patient or reading behind it.

![The opening shot and the four layers](film/ward-twin-loop.webp)

The full film, 34 seconds: [film/ward-twin-720.mp4](film/ward-twin-720.mp4), captured frame by frame on a controlled clock by `tools/film`.

**Live:** https://imsemoo.github.io/ward-twin/ (add `?stats` for a frame meter, or open [live mode](https://imsemoo.github.io/ward-twin/?mode=live))

## What it does

- **3D, plan and list views of the same floor.** Plan view drops every wall to a section cut 15 cm above the floor and inks it, so the model turns into the architect's drawing without swapping scenes. List view is the same data as an accessible table.
- **Four data layers on the floors:** bed state, temperature, CO₂ and call-light wait time, each with its key.
- **A 24-hour replay** with play, three speeds and a scrubber marked with every alert.
- **Or live.** Live mode connects to a feed and builds the floor from events as they arrive. In the demo, a mock server in a Web Worker streams the simulated day at a simulated minute a second, over the JSON protocol a real integration server would use. The footer shows the connection. "Take the server down for 4 seconds" shows the recovery: retries back off, the stage says the floor is stale, and the missed events are replayed on reconnect.
- **Pick anything:** click a room or a piece of equipment, or search for it with `/`. The camera flies to it and the side panel shows its day: bed states as a strip, 24-hour temperature and CO₂ charts with limits, call lights, and the equipment in the room.
- **Every view is a link.** The address bar keeps the view, layer, time and selection, so `?view=plan&layer=air&t=18:00&select=FAM` opens the family lounge at its stuffiest hour.
- **Alerts that only know the present.** Each alert is worded at the replay minute ("Pressed at 14:21, 9 min without an answer"), so scrubbing never leaks what happens next.

## How it is built

- React 19, TypeScript, React Three Fiber, drei and three.js, bundled with Vite.
- **The day is generated in a Web Worker** from a fixed seed, so the scene's first frame never waits on the simulation and every visitor replays the same day.
- **One day, two sources.** Every view is a function of a day and a minute. Replay hands the views the recorded day. Live mode folds a stream of events into the same shape, where anything still going on (a bed's current state, a call light that is on, an open alert) ends at Infinity until an event closes it. No view needed to know which source it reads.
- **A feed that stays whole.** Every event carries a sequence number.
  - A gap, four silent seconds or a dropped connection all end in a new subscribe that asks only for the missed events. The server sends the whole day so far when it no longer holds them.
  - Reconnects back off from half a second, doubling to 15 s, at a random point in the upper half of each wait, so screens do not all come back at once.
  - Events are applied at most once a frame, so a catch-up burst costs one render.
  - Building with `VITE_FEED_URL=wss://…` points the same client at a real WebSocket server. The protocol is in [docs/live-feed.md](docs/live-feed.md).
- **On-demand rendering.** The canvas draws only when something changes: a camera move, a new minute, a hover. An idle ward costs no GPU time.
- **Models through a glTF pipeline.** Beds, patients, bedside furniture and five kinds of equipment are parametric models in code (`tools/models`).
  - `npm run models` merges each model's parts into one mesh, with vertex colours and a tint mask.
  - It welds and quantises the meshes, compresses them with meshopt, and writes one file: `public/models/ward.glb`, 129 KB for 17,208 triangles.
  - The loader and decoder arrive after the first frame, so the scene opens on simple proxies and the detail streams in.
- **One draw call per model, with tinted parts.** A small shader patch applies each instance's colour only where the tint mask says so: a blanket shows the patient's acuity and a pump's housing its status, while the frame and the pole keep their own colours.
- **Per-instance level of detail.** Every instance picks its detailed model or its proxy by its distance from the point the camera looks at, with hysteresis, across two instanced meshes. Detail goes where the eye is: the overview draws 15k triangles, and a close-up about 130k.
- **Batching.**
  - All 38 room floors are one instanced mesh and the pick target.
  - The walls, glass and fixtures are merged geometry.
  - The 38 room labels are two batched text meshes, one per typeface.
- **Shadows on demand.** The sun and the building never move, so the shadow map is redrawn only when something that casts a shadow does: walls rising, a bed filling, a pump rolling to another room. Orbiting the camera reuses it.
- **Adaptive quality.** Four levels, from ambient occlusion with SMAA down to plain rendering at a pixel ratio of 1.
  - The frame rate is watched only while something moves.
  - After a slow window the level steps down, and it steps back up after smooth ones.
  - It stops flipping after four changes, so a device on the edge settles.
  - `?quality=0` to `3` pins a level.
- **Context loss recovery.** If the GPU driver resets, the scene says it has paused, and the canvas is rebuilt from scratch when the context comes back. A browser test forces a loss and checks the recovery.
- **Code-split by weight.** The interface paints first (85 kB gzipped). The scene and three.js follow (212 kB and 99 kB), then the model loader (20 kB). Ambient occlusion and SMAA load last, and only when the quality level uses them (157 kB, a third of it SMAA's lookup texture). CI enforces a budget for every chunk.
- **The camera fits the building by projection:** it projects the floor's corners through a trial camera to find the distance and offset that keep the model clear of the overlays, and turns the building lengthwise on tall screens.
- Reduced motion turns camera flights and the wall animation into cuts.

## Measured

Measured on an integrated Intel UHD GPU at 1280 × 800 and a pixel ratio of 1.25, orbiting continuously (`?stats=orbit`):

| Quality | Overview | Close to a room |
|---|---|---|
| 3: ambient occlusion and SMAA | 82 fps, 43 draw calls, 15k triangles | 80 fps, 49 draw calls, 129k triangles |
| 2: ambient occlusion | 92 fps | 91 fps |
| 1 and 0: no ambient occlusion | 144 fps (the display's refresh), 26 draw calls | 144 fps, 32 draw calls |

Left to itself, adaptive quality stayed at level 3 on this machine. An earlier run of the same measurement read up to 6 fps lower.

The on-screen meter (`?stats`) shows the frame rate while moving, draw calls, triangles and the quality level. A real low-end phone is still to be measured.

## Tests

- `npm test` runs 38 unit tests on the simulation, the queries, the alert wording and the live feed:
  - the same seed gives the same day;
  - every bed has exactly one state at every minute;
  - a vacated bed turns over in order;
  - alerts never word the future;
  - rooms never overlap, and no two pieces of equipment share a spot;
  - the 14:30 story the case study describes still holds;
  - the day rebuilt from the event log, batch by batch, reads exactly like the recording at every five-minute reading, and holds nothing from later in the day;
  - the connection resumes after a drop, asks again after a gap, drops a silent link and backs off with jitter.
- `npm run test:e2e` runs 9 browser tests at desktop and phone size, with real WebGL. They cover shared links, layers, the list view, search, playback, sideways scroll, recovery from a lost WebGL context, and live mode through a server outage. Every test fails on a console error.
- `npm run check` runs types, lint, the unit tests, the build and the bundle budget. CI runs all of it, plus the browser tests, before every deploy; a failing check blocks the deploy.

## Run it

```bash
npm install
npm run dev
```

`npm run build` writes a static site to `dist/`. `npm run models` rebuilds the model file, and `npm run check` runs every check CI runs except the browser tests.

## Credits

Concept, design and code by [Islam Nasser](https://imsemoo.github.io/eslam-portfolio/). Type: Schibsted Grotesk and Fragment Mono, both under the SIL Open Font License. Icons: Lucide.
