# 1. Render on demand

## Context

A digital twin stays open all day, often on a wall screen. Most minutes nothing on it changes, yet a canvas left to render every frame keeps the GPU busy, warms a laptop and drains a tablet.

## Decision

The canvas renders only when something changes. React Three Fiber runs with `frameloop="demand"`, and every change asks for a frame with `invalidate()`: a new minute, a camera move, a hover, a layer switch. Anything that animates, the camera flights, the walls rising, the dashes running along a route, asks for frames while it moves and stops asking when it settles.

## Consequences

- An idle twin costs no GPU time.
- Every animation has to invalidate its own frames, and has to end: the route's dashes run for 8 seconds and then settle, so a route left on show does not keep the GPU awake.
- Frame rates have to be measured while something moves. `?stats=orbit` orbits the camera so the frame meter reads the worst case, not an idle scene.
- Work done per frame, such as placing the tags (decision 5), runs only on frames that are drawn.
