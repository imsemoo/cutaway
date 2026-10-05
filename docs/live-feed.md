# The live feed

Live mode builds the floor from a stream of events. In the demo the stream comes from a mock server in a Web Worker (`src/live/server.worker.ts`), which plays the simulated day at a simulated minute a second. In a hospital, a small integration server would stand in front of the admissions, building management, nurse call and location systems, and the page would reach it with `VITE_FEED_URL`. The clinic (`?building=clinic&mode=live`) has a feed of its own, in the same protocol: the mock server playing the clinic's day, or the server at `VITE_CLINIC_FEED_URL`.

The views never learn which one they read: the page folds events into the same `Day` the replay uses (`applyEvents` in `src/live/events.ts`).

## Transport

Text frames, one JSON object each, over any ordered connection. The page's side (`src/live/feed.ts`) needs a `Transport`: it opens a connection, sends text, closes it, and reports open, message and close.

- `webSocketTransport(url)` connects to a real server.
- `mockTransport(start, building?)` in `src/live/mock.ts` reaches the worker. The first connection starts the mock server's clock at that minute, on the hospital's day or, given the clinic, on the clinic's.

## Page to server

```json
{ "type": "subscribe" }
{ "type": "subscribe", "day": 1, "after": 612 }
```

The first asks for the day so far. The second resumes: the page holds day 1 up to event 612 and wants what came after.

```json
{ "type": "act", "day": 1, "action": { "id": "k3f9qa-1", "alert": "temp-4A09-730", "act": "send", "team": "facilities", "by": "k3f9qa" } }
```

`act` is something an operator did: `ack` to acknowledge an alert, or `send` to send it to a `team` (nursing, housekeeping, facilities, bed-management). `by` names the screen it came from, and `id` is unique to the action. The server logs it as an `alert-action` event at its own clock and sends it to every subscriber, the screen that sent it included. It logs an action once, by its `id`, and ignores one for another day or for an alert that has not opened; a real server would also say why.

## Server to page

**`sync`** answers a subscribe.

```json
{ "type": "sync", "day": 1, "reset": false, "events": [], "at": 874 }
```

- With `reset: false`, `events` are exactly the ones after `after`.
- With `reset: true`, they are the whole day so far, and the page starts the day over. The server resets a new page, a page on another day, and a page that missed more than it keeps (the last 2,000 events, about a minute of the whole hospital).

**`event`** is one event, as it happens.

```json
{ "type": "event", "day": 1, "event": { "seq": 613, "at": 872.5, "kind": "call", "room": "4B04", "pressed": 861, "on": false } }
```

**`tick`** comes once a second, with the server's clock and the last seq it sent.

```json
{ "type": "tick", "day": 1, "at": 875, "seq": 613 }
```

`at` is the minute of the day, 0 to 1440. `seq` counts from 0 each day. At midnight the server starts a new day and sends every subscriber a `sync` with `reset: true`.

## Events

| `kind` | Fields | In a hospital, from |
|---|---|---|
| `bed` | `room`, `state` (occupied, dirty, cleaning, ready, blocked), `acuity`, `note` | Admissions, transfers and discharges; housekeeping |
| `asset` | `id`, `assetKind` (pump, vent, chair, xray, scanner), `loc`, `status` | Location tags |
| `readings` | `slot`, `temp` and `co2` by room, `battery` by pump | Building sensors and device telemetry, every five minutes |
| `call` | `room`, `pressed` (the minute it was pressed), `on` | Nurse call |
| `alert-open` | `alert`: `id`, `kind`, `from`, `since`, `severity`, `target`, `title` | A rules engine |
| `alert-close` | `id` | The same |
| `bed-request` | `id`, `wing`, `waiting`, and `room` once the patient has a bed | Admissions: ED, theatre and transfers asking for a ward bed |
| `discharge-plan` | `room`, `eta` (the minute the patient is expected to go) | The morning board round |
| `alert-action` | `action`: `id`, `alert`, `act`, `team`, `by` | Operators, through `act` |

An alert opens with only what is known then. A warm room or an unanswered call opens as a warning, and the page decides when it turns critical from the readings and the minutes waited.

Room ids and asset locations must be rooms in `src/data/floorplan.ts`. Readings and bed states for rooms the floor plan does not know are ignored.

## Keeping the stream whole

The page:

- expects every event's `seq` to be the last plus one, and every tick's `seq` to be the last it has. Anything else sends a new subscribe with `after`, and the stream is ignored until the answer arrives;
- treats four seconds without a frame as a dropped connection;
- reconnects after a drop, waiting before attempt n for a random time between half and all of min(15 s, 0.5 s × 2ⁿ), so screens do not all come back at once;
- applies events at most once per animation frame, so a catch-up burst costs one render;
- shows the connection in the footer, and says on the stage when the floor it shows is no longer live;
- keeps each action in an outbox until an `alert-action` event with its `id` comes back, sends what is still there after every `sync`, and drops it when the server moves to a new day. An action taken while the feed is down waits, and its alert says so.

"Take the server down for 4 seconds" in the demo drops every connection and refuses new ones for four seconds, so all of the above can be watched, an alert acknowledged during the outage included.

## Plugging in a real source

The integration server in `src/integration` is one: it takes the hospital's systems over MQTT and serves this protocol. [integration.md](integration.md) has its topics and how to run it with a simulated hospital (`npm run hospital`). Any other server works the same way:

1. Speak this protocol. Keep each day's events in order with a `seq`, publish each one as it happens, tick once a second, answer subscribe from a buffer of recent events, and log each `act` once, as an event, passing it on to the team's own system. `src/live/hub.ts` does all of that, for the mock and for the integration server.
2. Map each system to events, as in the table above.
3. Build the page with `VITE_FEED_URL=wss://your-server/ward npm run build`.

The views, the scene and the tests stay as they are. The property test in `src/live/events.test.ts` is the contract: replayed as events, the recorded day must read exactly like the recording at every five-minute reading, and hold nothing from later in the day.
