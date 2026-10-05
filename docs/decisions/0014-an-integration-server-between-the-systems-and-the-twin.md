# 14. An integration server between the hospital's systems and the twin

## Context

The live feed had a protocol and a mock server, and its documentation said a real source would need a server that speaks it. A hospital's systems do not: building sensors, admissions, nurse call and location tags each speak their own protocol, and most can reach MQTT through a gateway.

The browser could subscribe to an MQTT broker itself, over WebSocket. Every screen would then hear every sensor: 3,416 messages every five minutes for the readings alone, a million a day. Each screen would work out the alerts on its own, and two screens could disagree about when one opened. MQTT keeps no history beyond the last message a topic retains, so a screen that reconnects could not ask for what it missed. And an operator's action would have nowhere to be recorded once.

## Decision

An integration server stands between them (`src/integration`). It subscribes to the hospital's topics, one per room, asset or flow, checks each message, turns changes into the feed's numbered events, gathers readings into one frame every five minutes, and works out the alerts itself, by the limits the simulation records the day with (`src/data/limits.ts`). It serves the feed over WebSocket in the protocol the twin already speaks, through the same hub as the demo's mock (`src/live/hub.ts`), so the twin connects with `VITE_FEED_URL` and nothing in it changes. An operator's action is logged once, sent to every screen, and published on MQTT for the team it was sent to.

The contract is a set of topics and payloads (`src/integration/topics.ts`, [integration.md](../integration.md)). The demo's devices replay the recorded day as raw messages, with no alert among them.

## Consequences

- A screen receives a frame every five minutes rather than every sensor's message, and every screen sees the same alerts, opened at the same minute.
- A test publishes the whole recorded day as the systems would, 1,005,153 messages, and the server's engine must turn them into exactly the recording's event log, 21,904 events with all 881 alerts, which it is not given. Another runs the broker, the server, a screen and a team end to end.
- Writing the rules for live data showed the simulation had recorded stale air at the first high reading, although the rule needs two; a live engine cannot know about the second until it arrives. The simulation now flags it at the second reading and dates the air from the first.
- The first version published at QoS 0, and a broker under the day-so-far burst dropped most of it. Every message now goes at QoS 1, a few hundred in flight at a time.
- One more service to run. Its log is in memory, it does no authentication of its own, and the devices supply the clock; integration.md lists what a hospital would add.
- The server shares the protocol's server side with the mock, so the mock was rebuilt on the same hub: one implementation of resume, ticks and actions, not two.
