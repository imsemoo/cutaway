# 11. The model is one keyboard widget

## Context

A pointer can pick any of the 1,368 rooms in the canvas. A keyboard could not: it reached the search box, the panel, the timeline and the list view, but not the model itself, and a screen reader heard nothing about what was on the floors or what had just gone wrong.

There were three ways in. A button over every room, placed from the scene like the tags, would put hundreds of stops in the tab order and move them every frame. A roving focus over hidden buttons, one per room, would keep one tab stop but give a screen reader a list with no sense of where anything is. Or the model could be a single widget that takes the arrow keys and says where they lead.

## Decision

The canvas is one tab stop with `role="application"`, named "3D model of the hospital" and described by the keys it takes. The arrow keys move a cursor to the nearest room in that direction on screen, or, in a level or the whole hospital, the nearest wing; Enter opens it and Escape steps back out, to the level and then the hospital. The cursor is the hover, so a sighted keyboard user sees what a pointer would show, the lit floor and its tag, and every move is said in a polite live region: "Patient room 4A09, Occupied", or "Level 4, A wing: 20 of 28 beds occupied".

The directions are the screen's, not the plan's. The camera turns, and on a phone the building lies lengthwise, so "right" means what the eye sees as right.

Alerts that open while the day plays or streams live are said too, gathered for four seconds at a time so a fast replay does not bury the reader, and only those in the place on show.

## Consequences

- `role="application"` hands every key to the page, so the keys are written out: in the element's description, and on screen while it has focus.
- The list view stays the full non-visual version of the floor, and search reaches any room or piece of equipment by name. The keyboard model is for moving around what is on show, not a replacement for either.
- The cursor code and its announcements live in the scene's chunk, and the alert announcer loads after the first paint, so neither adds to what paints the interface.
- axe-core checks eight views a link can open, at desktop and phone size, against WCAG 2.2 A and AA on every push; the first run found one violation, a label on the canvas's container, which had no role. A browser test drives the model from the keyboard and another waits for an alert to be said.
- Automated checks do not prove it is pleasant to use. It has not been tried with a screen reader by someone who uses one every day.
