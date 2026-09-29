# 5. Tags in the page, placed from the scene

## Context

The labels beside a room or a pump are text on a white card, with a colour dot, in English or Arabic. drei's `<Html>` renders such labels as DOM from inside the scene, but under React 19 it could unmount its inner root in the middle of a render and leave a tag empty.

## Decision

Tags are plain elements in the page, above the canvas. Each registers an anchor, a point in the scene; `TagTracker`, inside the scene, projects every anchor on each rendered frame and moves its tag with a transform.

## Consequences

- Tags are real text: crisp at any zoom and set in the page's own fonts, Arabic included.
- There is no React root per tag, and no empty tags.
- Tags move only on frames that are drawn, which on-demand rendering (decision 1) already guarantees whenever the camera moves.
