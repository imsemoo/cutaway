# The making of Ward Twin

Ward Twin began as one hospital floor and grew into six levels of six wings, a live feed, wayfinding, a heatmap that had to be rebuilt, and an Arabic interface. This is how, with the numbers measured before and after each change. Frame rates are from one laptop, an integrated Intel UHD GPU at 1280 × 800 and a pixel ratio of 1.25, orbiting at the top quality level; its own load moves them by up to 16 fps between runs, so each is given as the range of three.

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

A dashboard can now put the twin inside itself with one tag, `<ward-twin>`, which frames the twin and talks to it in messages ([decision 10](decisions/0010-embed-through-an-iframe.md)). The twin's side of that conversation loads only when the page runs in a frame, so it should have cost an ordinary visit nothing. The budget said otherwise: the first load went from 89.7 to 90.6 kB, over its 90 kB limit. The bridge shares the language and query modules with the entry, and once it imported them too, the bundler moved them into a small chunk of their own, which the entry loads at once. Of the 0.9 kB, 0.2 kB was code; the rest was the cost of a separate file.

Five ways around it were measured: two bundler settings, a hand-made React chunk, loading the bridge from the entry file, and handing the bridge its helpers from the app so it imported nothing shared. None got under 90.2 kB. The budget went to 91 kB, with the reason in the script, which is the rule the budget set for itself.

The unit tests found one real fault in the bridge. A host that set a room and a time in one command heard about the room at once and the time a second later: each change was reported on its own, and the clock is throttled to once a second so that a playing day does not flood the host. A host's command is now applied whole and reported once.

## A race the CI found

The embed's first push failed CI in a test that had passed on every push before it: a lost WebGL context should pause the scene and rebuild it, and instead the scene fell back to the message for browsers without WebGL. On the slower CI machine the effects chunk, 157 kB of ambient occlusion and SMAA, arrived after the test had lost the context, and the effect composer set itself up on a dead context and threw. The test now runs twice, once with the effects already running and once holding their chunk back until after the loss, which fails without the fix every time. The effects now mount only on a live context.

## Accessible, and checked

The model became one keyboard stop that takes the arrow keys ([decision 11](decisions/0011-the-model-is-one-keyboard-widget.md)), and axe-core now checks eight views at two sizes on every push. Its first run found a single violation, repeated on every view: the canvas's container had a label and no role. Adding the checks also showed something about the tests themselves. Run beside the live-mode test, their weight starved its pages, which render WebGL on the CPU, until the feed's four-second silence check dropped every link; with this change set aside, the same crowding failed the same way. The checks now run as a stage of their own, after the rest.

## Not measured yet

Every number here comes from one laptop and emulated phones. A low-end Android phone and an iPhone are the tests the project still needs, and so is an afternoon with someone who uses a screen reader every day.
