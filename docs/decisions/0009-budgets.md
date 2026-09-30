# 9. A budget for every chunk, and for the first load

## Context

A 3D app grows quietly: a helper pulls in a library, a chunk absorbs another, and the first paint slows without anyone deciding it should. The part that paints the interface matters most, because it is what a visitor waits for.

## Decision

`scripts/budget.mjs` checks every built chunk's gzipped size against a budget, and the first load, the entry chunk plus every chunk it imports statically, against 90 kB. CI runs it before every deploy, and a chunk over budget blocks the deploy. Raising a budget needs a written reason in the script, as the effects chunk has for SMAA's lookup texture.

## Consequences

- The first load stayed at 89.7 kB when the Arabic interface arrived, because live mode and the list view moved to chunks of their own.
- The budget caught a regression nobody would have seen. A top-level `await` in the entry made the bundler move every shared module into a chunk of its own, among them the core of @react-three/fiber as a 140 kB chunk. Rendering after a promise instead restored the split.
- Counting only the entry chunk would have missed that the bundler can move shared modules out of it into small chunks that still load first. The first-load check counts them.
- The first raise came with the embed bridge ([decision 10](0010-embed-through-an-iframe.md)). The bridge loads only in a frame, but sharing modules with the entry led the bundler to split them into a chunk that loads first: 90.6 kB, of which 0.2 kB was new code. Two bundler settings, a hand-made React chunk, loading the bridge from elsewhere and handing it its helpers from the app each left it at 90.2 kB or more. The budget is 91 kB now, and the script says why.
