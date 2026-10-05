# 16. A feed for each building

## Context

The integration server (decision 14) served the hospital alone: its topics sat under `cutaway/`, its rules knew the hospital's rooms by the floor plan in code, and it flagged a bed left dirty for an hour as a ward does. The clinic, read from its BIM model (decision 15), had only a replayed day. To run live it needed its own rooms known to the server, its own rules, and its systems' messages kept apart from the hospital's.

One server could have served both on one feed, each event carrying its building. Every screen would then receive both days and drop the one it does not show, a reconnecting screen would catch up on both, and a building's new day would start every screen over.

## Decision

A building is a site (`src/integration/sites.ts`): the topic root its systems publish under, the rooms it knows, and the rules that apply to it. The hospital's root stays `cutaway`; the clinic's is `cutaway/clinic`, with the same topics beneath it. A server serves one site, with an engine and a feed of its own; `npm run hospital` runs one for each on one broker. The page opens the feed of the building it shows: `VITE_FEED_URL` for the hospital, `VITE_CLINIC_FEED_URL` for the clinic, or the demo's mock server playing that building's day.

## Consequences

- The feed protocol did not change, and neither did the hospital's topics or anything a hospital screen does.
- The clinic flags no turnover. Its rooms wait for cleaning past the ward's hour, and nothing is flagged; the engine test holds the clinic's whole day, 78,452 messages, to exactly its recorded log, 2,730 events and 11 alerts.
- The clinic's simulation had recorded two ready spans in a row at the end of each room's day, which a server, passing on a repeated status once, never would; the room's "ready since" would have jumped forward. The simulation now keeps one span to midnight.
- A deployment with many buildings runs a server, or at least a hub and an engine, for each. One process could host them all behind one port, on a path per building, if that ever matters more than keeping them apart.
