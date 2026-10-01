# 10. Embed through an iframe, with the link's own words

## Context

A twin is rarely the whole screen. The people who would use one already work in a dashboard, a bed board or a nurse station view, and the twin has to live inside it: opened on a room the dashboard names, and telling the dashboard when an alert opens.

There were three ways to put it there. The twin could ship as a React component for the host to render; as a web component that draws the twin straight into the host's document; or as its own page in an iframe, driven by messages.

## Decision

An iframe, driven by a small `postMessage` protocol, wrapped in a 1 kB custom element, `<cutaway-twin>`, so a host writes one tag and listens for events. The protocol is in [embed.md](../embed.md).

The twin brings React 19, three.js, its fonts and styles, a Web Worker and a WebGL context. Inside the host's document they would meet the host's own framework, its versions and its CSS, and an error in the twin could take the host down with it. In a frame they stay apart; the twin deploys on its own schedule; and when the two are on different origins, neither can read the other's page. The frame is a boundary, not just a box.

The commands use the link's vocabulary, `at`, `select`, `layer`, `t`, with the same values, and the same function checks both, so there is one set of names to learn and one place that decides what is valid.

## Consequences

- A host cannot reach inside or restyle the twin. What a host needs has to become a message; that is the point, and also the cost.
- Messages are asynchronous. The twin announces itself, the host connects, and from then on the twin talks only to the origin that connected. A host command is applied whole and reported once.
- The bridge that speaks the protocol loads only when the page runs in a frame. It still made the first load 0.9 kB heavier for every visit: it shares modules with the entry, and the bundler keeps those in a chunk of their own. Five ways around it failed, and the first-load budget went from 90 to 91 kB with the reason written down ([decision 9](0009-budgets.md)).
- Unit tests drive the bridge through a fake frame, and a browser test embeds the twin in a page on another origin, moves it and listens to it.
