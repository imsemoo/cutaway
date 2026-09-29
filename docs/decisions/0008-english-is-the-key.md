# 8. English is the key for the Arabic interface

## Context

The interface needed Arabic, right to left, without a translation library, without slowing an English visit, and without turning every string in the code into an opaque key.

## Decision

Every string stays in English where it is used and passes through `say()`; the Arabic catalogue maps the English to Arabic. Counts pass through `plural()`, which uses `Intl.PluralRules` for Arabic's six forms. The catalogue loads only when Arabic is chosen. The layout mirrors, but time and scales keep running left to right, as in a media player: the timeline, the charts, the colour ramps and the map of the building. Vazirmatn, the Arabic face, was chosen by setting the interface's own text in six faces, and is declared for Arabic letters only.

## Consequences

- The code reads as it did, and a missing translation falls back to English, never to a key.
- An English visit downloads neither the catalogue (5.9 kB) nor the font.
- Changing an English string changes its key. A test parses the source with the TypeScript compiler and fails if the catalogue misses a string, drops a placeholder, or keeps one the interface no longer says.
- Digits stay Western, like the room numbers and clock times beside them.
