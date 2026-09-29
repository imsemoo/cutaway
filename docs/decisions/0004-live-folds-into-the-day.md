# 4. Live mode folds events into the same day

## Context

A real integration streams events: a bed changes state, a call light goes on, a reading arrives. The views, the panel, the list and the floors, were written for a recorded day and a minute.

## Decision

Live mode builds the same `Day` the views already read. A server sends numbered events over a small JSON protocol; the page folds each batch into the day, and anything still going on ends at `Infinity` until an event closes it. The page resumes by sequence number after a drop, backs off with jitter, and drops a link that has gone silent. The protocol is in [live-feed.md](../live-feed.md).

## Consequences

- No view had to change. Replay and live differ only in where the day comes from.
- A test replays the whole recorded day as events, batch by batch, and checks that it reads exactly like the recording at every five-minute reading.
- Folding at hospital scale had to be fast. The first fold searched thousands of records one by one for every event and copied more than each event changed; that test took 30.8 s. Index maps built once a batch, and copying only the array an event changes, brought it to 9.9 s.
- The live code loads only when live mode is turned on.
