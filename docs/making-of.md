# The making of Cutaway

Cutaway began as one hospital floor and grew into six levels of six wings, a live feed, wayfinding, a heatmap that had to be rebuilt, an Arabic interface, and alerts and a forecast an operator can work with. This is how, with the numbers measured before and after each change. Frame rates are from one laptop, an integrated Intel UHD GPU at 1280 × 800 and a pixel ratio of 1.25, orbiting at the top quality level; its own load moves them by up to 16 fps between runs, so each is given as the range of three.

## From one floor to a hospital

The first hospital build copied the floor's plan into 36 wings and hid the ones out of view. It looked right and measured wrong: the one-wing view still sent every wing to the GPU, 207,500 triangles for a view that needed 15,000. Hiding a wing had not stopped it being drawn.

The fix was to pack only the wings in scope into the instances drawn and to stop each instanced mesh's `count` there. A wing out of view now costs nothing, not even its vertices, and the whole hospital, with all 1,368 rooms, 1,008 beds and 3,006 pieces of equipment on screen, draws in 33 draw calls, fewer than one wing up close.

| View | Frame rate | Draw calls | Triangles |
|---|---|---|---|
| A wing | 69 to 81 fps | 43 | 15k |
| Close to a room | 61 to 77 fps | 48 | 128k |
| A level, six wings | 74 to 90 fps | 33 | 81k |
| The whole hospital | 72 to 90 fps | 33 | 175k |

The simulation grew with it. The whole day now takes 0.6 to 0.75 s in the browser, so the worker posts the wing on show first: it arrives in 25 to 29 ms, and a link to one wing no longer waits for the other 35.

## Live at hospital scale

Live mode folds a stream of events into the same day the views read, and a test replays the whole recorded day as events, batch by batch, checking it against the recording at every five-minute reading. At one floor that was quick. At hospital scale the first fold searched the 3,006 pieces of equipment one by one for every event, and copied all of a room's series when an event changed one; the test took 30.8 s. Index maps built once a batch, and copying only the array an event changes, brought it to 9.9 s.

## A bug the film found

The demo film is captured frame by frame on a fixed clock. Reading its frames showed something no test had: moving to the whole hospital or a level left the side panel scrolled where the last place had left it, so the new place opened in the middle of a list with its heading out of sight. The panel now scrolls to the top when the place changes, and a browser test scrolls it down, opens a room and checks.

The fix threw an error on its first run. `aside.scrollTo()` returns a promise in current Chrome, and an arrow function that returned it made React take the promise for an effect's cleanup. The test's console check caught it before it shipped.

## A test that failed under load

A unit test checks that no two pieces of equipment ever share a spot, for 3,006 pieces at 48 minutes of the day, with an assertion for each. Alone it took 1.8 s; with the whole suite sharing the CPU it sometimes ran past the 5 s timeout and failed for no reason in the code. Gathering the clashes and asserting once took it to 0.2 s, and a failure now lists every clash.

## A heatmap that would have lied

The roadmap asked for temperature and air as smooth fields interpolated between sensors, in place of one colour a room. The first version did exactly that, and the screenshots showed the problem: a hot room drawn as an oval cooling towards its walls, its heat blended into the neighbours' through them. Walls keep one room's air from another's, so every gradient inside a room was a reading no sensor had taken.

It was rebuilt the other way round. Rooms keep their own sensor's colour; only the corridors, which have no sensors, are estimated, from the doors that open onto them, weighted by how wide each door is. A warm room's heat now shows spilling out of its door, with isolines and the alert limit drawn on the corridor floor. Switching the layer on costs 1 or 2 fps. The reasoning is kept as [decision 7](decisions/0007-corridors-not-walls.md).

## Arabic without weight

The Arabic interface had to arrive without slowing an English visit, whose first load was 89.6 kB gzipped, just under its 90 kB budget. English stays the key in the code, the Arabic catalogue is its own 5.9 kB file, and the Arabic face loads only for Arabic letters. Live mode and the list view moved to chunks that load when they are opened, which paid for the translation machinery: the first load is 89.7 kB with Arabic in it.

Loading the catalogue before the first paint was written first as a top-level `await` in the entry. The bundler answered by moving every shared module into a chunk of its own, among them the core of @react-three/fiber as a 140 kB chunk, and the budget failed. Rendering after a promise put things back. The episode also showed that the budget counted only the entry file while the bundler could move shared code into small chunks that still load first, so the budget now counts the first load as a whole.

The Arabic face was chosen by setting the interface's own text in six faces beside Schibsted Grotesk and comparing them: Vazirmatn matched its size and calm and kept the panel's line spacing.

## An embed, and the kilobyte it cost

A dashboard can now put the twin inside itself with one tag, `<cutaway-twin>`, which frames the twin and talks to it in messages ([decision 10](decisions/0010-embed-through-an-iframe.md)). The twin's side of that conversation loads only when the page runs in a frame, so it should have cost an ordinary visit nothing. The budget said otherwise: the first load went from 89.7 to 90.6 kB, over its 90 kB limit. The bridge shares the language and query modules with the entry, and once it imported them too, the bundler moved them into a small chunk of their own, which the entry loads at once. Of the 0.9 kB, 0.2 kB was code; the rest was the cost of a separate file.

Five ways around it were measured: two bundler settings, a hand-made React chunk, loading the bridge from the entry file, and handing the bridge its helpers from the app so it imported nothing shared. None got under 90.2 kB. The budget went to 91 kB, with the reason in the script, which is the rule the budget set for itself.

The unit tests found one real fault in the bridge. A host that set a room and a time in one command heard about the room at once and the time a second later: each change was reported on its own, and the clock is throttled to once a second so that a playing day does not flood the host. A host's command is now applied whole and reported once.

## A race the CI found

The embed's first push failed CI in a test that had passed on every push before it: a lost WebGL context should pause the scene and rebuild it, and instead the scene fell back to the message for browsers without WebGL. On the slower CI machine the effects chunk, 157 kB of ambient occlusion and SMAA, arrived after the test had lost the context, and the effect composer set itself up on a dead context and threw. The test now runs twice, once with the effects already running and once holding their chunk back until after the loss, which fails without the fix every time. The effects now mount only on a live context.

## Accessible, and checked

The model became one keyboard stop that takes the arrow keys ([decision 11](decisions/0011-the-model-is-one-keyboard-widget.md)), and axe-core now checks eight views at two sizes on every push. Its first run found a single violation, repeated on every view: the canvas's container had a label and no role. Adding the checks also showed something about the tests themselves. Run beside the live-mode test, their weight starved its pages, which render WebGL on the CPU, until the feed's four-second silence check dropped every link; with this change set aside, the same crowding failed the same way. The checks now run as a stage of their own, after the rest.

## A new name

It was called Ward Twin, a plain description of the first version: a digital twin of one hospital ward. By the time it held six levels of six wings the name described a fraction of it. A cutaway is the architect's drawing that removes part of a building's shell to show what is inside, which is what the plan view's section cut and the levels drawn apart already did, so the project took that name in October 2026. In Arabic it is مقطع, the same drawing's name.

## Alerts someone can answer

Until October the panel listed alerts and nothing could be done about them. Now an operator acknowledges one and sends it to the team that owns it, and each alert keeps a log: opened, acknowledged, sent, cleared ([decision 12](decisions/0012-operators-acknowledge-the-data-clears.md)). Clearing stayed with the data, as alarm standards keep it, so the log can say what an alarm review looks for: "Cleared after 1 min, never acknowledged".

Live, the action travels over the feed and comes back as an event, so every screen sees the same thing. The demo's outage button is the test: an alert sent to facilities while the server is down shows "Waiting for the connection to send" and arrives once the server is back, logged once however many times it was sent. A browser test does exactly that.

The alert list and the forecast below load after the first paint, which held the first load to 90.8 kB of its 91.

## A forecast the backtest corrected

The overviews now forecast the next four hours of ward beds as a range ([decision 13](decisions/0013-a-forecast-checked-against-the-day.md)). The first version looked plausible on screen. The backtest, which makes the forecast every half hour from 06:00 in every wing and compares it with what the day did four hours later, said it held its range 50% of the time where it aimed for 80%, and missed by 5.2 beds on average.

Two faults explained it. The draw of how many patients arrive returned −1, not 0, outside admission hours, so every quiet step counted a bed that did not exist; fixing it took the range to 88.5% and the miss to under a bed. The second was a blind spot: before the morning round has written its plans, the forecast saw almost no one going home. At 08:00 it put the whole hospital at nine patients short of beds by noon, and noon came with 19 beds to spare. It now expects the discharges the round has yet to plan from the usual day, and says 21, with a range of 12 to 30. On the same window, the range now holds 91.8% of the time and misses by 0.96 of a bed. A forecast of the whole hospital takes 2.8 ms.

One day is a thin test for the hospital as a whole, so the unit tests also run it over twelve other simulated days, where it holds 80% of the time four hours ahead, as it aims to. `npm run backtest` prints both tables.

## A server for a real hospital

The live feed's documentation said a real source needed a server that speaks the protocol; now there is one ([decision 14](decisions/0014-an-integration-server-between-the-systems-and-the-twin.md), [integration.md](integration.md)). The hospital's systems publish raw messages on MQTT, a million a day; the server checks them, works out the alerts by the simulation's own limits, and serves the feed. The test that matters publishes the whole recorded day as those raw messages and requires the server's engine to produce exactly the recording's event log, 21,904 events with every one of its 881 alerts, though it is given none of them.

It passed on its first full run, after one fault in the recording. A live engine flags stale air at the second high reading, since the rule needs two in a row; the simulation had flagged it at the first, as if it knew the second would follow. The alerts carry only what is known when they open, the code says, and this one knew five minutes more. The simulation now flags it at the confirming reading.

Running it as one machine-sized hospital found the second fault, in the plumbing. The systems' devices published the day so far, 612,883 messages, at MQTT's lowest quality of service, and ten seconds later the server had received 24,829: the broker drops what a subscriber cannot take as fast as it comes, and the twin showed one occupied bed. At QoS 1, with a few hundred messages in flight at a time, every message arrives, in about 23 seconds.

## A real building

Every wing of the hospital is built to one plan, which is what lets 36 of them draw as instances, and also what a real building never is. So the twin now reads one: buildingSMART's Medical-Dental Clinic, a real two-storey clinic published as a 13 MB IFC file ([decision 15](decisions/0015-a-real-building-read-at-build-time.md), [buildings.md](buildings.md)). web-ifc reads it at build time, in Node, and each room's outline is cut from its own mesh, the boundary of its lowest face. The page loads 34 kB of outlines, names and doors, and never the parser.

The check is the model's own figures. Each room states its area, and the outlines came out a median 7.6 % small, up to 29 % in narrow rooms, which looked like a fault in the cutting until the reason showed: the model measures a room to the middle of its walls, and an outline stops at their faces. Counting half of a 12 cm wall around each room, the median room is within 0.7 % of the stated area and all but one of 259 within 5 %. A narrow room has the most wall for its floor, which is why it looked the worst.

Its tests found two faults the screenshots had not. The simulated clinic rang a call light a minute after the patient had left: a call drawn at a random point in a five-minute slot could fall past the end of the visit. And on a phone the switch between the clinic's floors showed three empty buttons, because phone widths keep only the icons of every switch and this one, alone, has words only.

The clinic page cost the hospital first. It shares the store, the language and the icons with the entry, and the bundler cut more of them into chunks of their own: the first load went from 90.9 kB to 91.7 kB, over its budget. Rather than raise the budget, a room's and a piece of equipment's details moved after the first paint, as the alert list had, since neither can show anything before the day arrives. The first load is 89.7 kB.

## The real building, live

The clinic had a real plan and a replayed day. To run it live, the integration server had to learn that it serves a building, not the hospital: a building became a site, with its own topic root, its own rooms and its own rules, and a server serves one ([decision 16](decisions/0016-a-feed-for-each-building.md)). The clinic's rules leave out turnover, since an empty exam room is not an alarm.

The check was the one the hospital passed: the clinic's whole day told as raw messages, 78,452 of them, through the clinic's engine, must come out as exactly its recorded log. Against the recording as it stood, it fails, on a fault in the recording rather than the engine. At the end of the day the clinic's simulation wrote two ready spans in a row for every one of its 49 care rooms, where a server that passes on a repeated status once writes one: room 1A15 was ready from 17:45, and its "ready since" would have jumped to 17:57 with nothing happening. The simulation now keeps one span to midnight, and the log matches: 2,730 events, all 11 alerts.

On the page, the clinic switched to the hospital's own timeline, with its Replay and Live switch and the connection's state, instead of keeping a replay-only copy of it; its code came out 0.2 kB smaller.

## Not measured yet

Every number here comes from one laptop and emulated phones. A low-end Android phone and an iPhone are the tests the project still needs, and so is an afternoon with someone who uses a screen reader every day.
