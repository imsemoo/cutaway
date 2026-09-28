# Ward Twin

A concept digital twin of one hospital floor, in the browser. A 3D model of a 28-bed ward and ICU replays a simulated day: beds turning over from occupied to cleaning to ready, a room warming up through an HVAC fault, call lights waiting too long at shift change, and equipment moving between rooms.

Everything on screen is simulated. There is no real hospital, patient or reading behind it.

**Live:** https://imsemoo.github.io/ward-twin/ (add `?stats` for a frame meter)

## What it does

- **3D, plan and list views of the same floor.** Plan view drops every wall to a section cut 15 cm above the floor and inks it, so the model turns into the architect's drawing without swapping scenes. List view is the same data as an accessible table.
- **Four data layers on the floors:** bed state, temperature, CO₂ and call-light wait time, each with its key.
- **A 24-hour replay** with play, three speeds and a scrubber marked with every alert.
- **Pick anything:** click a room or a piece of equipment, or search for it with `/`. The camera flies to it and the side panel shows its day: bed states as a strip, 24-hour temperature and CO₂ charts with limits, call lights, and the equipment in the room.
- **Every view is a link.** The address bar keeps the view, layer, time and selection, so `?view=plan&layer=air&t=18:00&select=FAM` opens the family lounge at its stuffiest hour.
- **Alerts that only know the present.** Each alert is worded at the replay minute ("Pressed at 14:21, 9 min without an answer"), so scrubbing never leaks what happens next.

## How it is built

- React 19, TypeScript, React Three Fiber, drei and three.js, bundled with Vite.
- **The day is generated in a Web Worker** from a fixed seed, so the scene's first frame never waits on the simulation and every visitor replays the same day.
- **On-demand rendering.** The canvas draws only when something changes: a camera move, a new minute, a hover. An idle ward costs no GPU time.
- **Instancing and batching keep draw calls low.** All 38 room floors are one instanced mesh and the pick target; walls, glass and fixtures are merged geometry; each equipment type is one instanced mesh; the 38 room labels are two batched text meshes, one per typeface. A frame is 31 draw calls on desktop with ambient occlusion, and 17 on a phone.
- **Shadows on demand.** The sun and the building never move, so the shadow map is redrawn only when something that casts a shadow does: walls rising, a bed filling, a pump rolling to another room. Orbiting the camera reuses the last one.
- **Code-split by weight.** The interface shell paints first (82 kB gzipped); the 3D scene follows (312 kB), and ambient occlusion loads last, on desktop only (97 kB).
- **The camera fits the building by projection:** it projects the floor's corners through a trial camera to find the distance and offset that keep the model clear of the overlays, and turns the building lengthwise on tall screens.
- Reduced motion turns camera flights and the wall animation into cuts.

## Run it

```bash
npm install
npm run dev
```

`npm run build` writes a static site to `dist/`.

## Credits

Concept, design and code by [Islam Nasser](https://imsemoo.github.io/eslam-portfolio/). Type: Schibsted Grotesk and Fragment Mono, both under the SIL Open Font License. Icons: Lucide.
