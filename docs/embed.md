# Embedding Cutaway

Another page can put the twin inside itself, move it, and hear what happens in it. A dashboard can open a room from its own list, switch the layer, play the day, and show the twin's alerts in its own interface.

**Demo:** [a mock operations page](https://imsemoo.github.io/cutaway/host/) that does all of that. Its source is [`public/host/index.html`](../public/host/index.html), plain HTML and script with nothing to build. Like the twin, it is a concept with simulated data.

## The element

```html
<script src="https://imsemoo.github.io/cutaway/embed.js" defer></script>

<cutaway-twin at="level-4" layer="temp" style="height: 40rem"></cutaway-twin>
```

`embed.js` is 1 kB gzipped and has no dependencies. It defines `<cutaway-twin>`, which runs the twin in an iframe inside it, so the twin's React, three.js, fonts, styles and WebGL context stay its own and cannot clash with the host's ([decision 10](decisions/0010-embed-through-an-iframe.md)).

The element finds the twin in the folder the script came from. For a copy hosted elsewhere, point `src` at it. Load the script as a classic script, as above, since that is how it reads its own address.

### Attributes

The attributes are a link's parameters, with the same values.

| Attribute | Values | |
|---|---|---|
| `at` | `hospital`, `level-4`, `4a` | The place on show: the whole hospital, a level or a wing. |
| `select` | `4A09`, `FAM`, `IVP-07` | A room or a piece of equipment. The twin flies to it and opens its day. |
| `view` | `3d`, `plan`, `list` | |
| `layer` | `beds`, `temp`, `air`, `calls` | |
| `t` | `15:30` | The minute of the replay. |
| `mode` | `replay`, `live` | |
| `lang` | `en`, `ar` | The twin's language. |
| `src` | a URL | Where the twin is, if not beside the script. |
| `title` | text | The frame's accessible name. It says what the twin is by default. |

The attributes present when the element starts go into the frame's address, so the twin opens where they say without a flash of anything else. A change after that is sent to the twin as a command. Removing `select` clears the selection.

### Methods and properties

- `set(settings)` changes several things at once: `twin.set({ select: '4A09', layer: 'temp' })`. The keys are the attribute names, and `playing: true` or `false` plays or pauses the replay. Settings made before the twin is ready wait for it.
- `state` is where the twin stands, as it last said, in the same terms: `{ at, select, view, layer, t, mode, lang, playing }`. It is `null` until the twin is ready.
- `alerts` is the list of alerts open at the twin's minute.

### Events

Every event bubbles, and carries its data in `detail`.

| Event | `detail` | When |
|---|---|---|
| `twin-ready` | `{ state }` | The twin is connected and takes commands. |
| `twin-change` | `{ state, before }` | Anything in `state` changed, from the host or from someone using the twin. |
| `twin-select` | `{ id }` | Something was selected, or the selection cleared (`id` is `null`). |
| `twin-alerts` | `{ alerts }` | The alerts open at the twin's minute changed. |
| `twin-alert` | `{ alert }` | An alert opened while the clock ran forward, playing or live. |
| `twin-error` | `{ key, message }` | A setting the twin could not take. The rest of that command was applied. |

An alert is `{ id, kind, severity, title, text, target, where, wing, since, opened }`; `since` is when what it is about began, the call pressed or the bed vacated, and `opened` when the alert opened. `title`, `text` and `where` are worded in the twin's language, as its own panel words them; `kind` and `severity` are stable codes for a host that words alerts itself. `target.id` is what `set({ select })` takes to show it.

```js
const twin = document.querySelector('cutaway-twin')

twin.addEventListener('twin-alert', (e) => {
  const { alert } = e.detail
  notify(`${alert.title}: ${alert.where}`, () => twin.set({ select: alert.target.id }))
})

twin.addEventListener('twin-select', (e) => showRoomInSidebar(e.detail.id))
```

## The protocol

A host that manages its own iframe can speak to the twin directly with `postMessage`. The types are in [`src/embed/protocol.ts`](../src/embed/protocol.ts).

Every message carries `protocol: 'cutaway/1'`, and both sides ignore any message without it.

1. When the twin can take commands, it posts `{ type: 'ready' }` to its parent, to any origin. The message carries nothing else.
2. The host answers `{ type: 'connect' }`.
3. From then on the twin takes commands only from the origin that connected and posts only to it. It sends `state` and `alerts` at once, then whenever they change.

| From the host | |
|---|---|
| `{ type: 'connect' }` | Starts the conversation. Sending it again, after the twin reloads, starts a new one. |
| `{ type: 'set', ...settings }` | The settings above. Keys left out stay as they are. |

| From the twin | |
|---|---|
| `{ type: 'ready' }` | The twin is listening. |
| `{ type: 'state', state }` | Where the twin stands. |
| `{ type: 'alerts', alerts }` | Every alert open at the twin's minute. |
| `{ type: 'alert', alert }` | One alert that opened while the clock ran forward. |
| `{ type: 'error', key, message }` | A setting it could not take, and why. |

Wait for `ready` before sending `connect`. The twin's listener loads with the page, a moment after the frame's `load` event, so a `connect` sent at `load` can arrive before anyone is listening.

## What it does and does not let a host do

- A host can do what a link can, and no more. Every value is checked the way a link's is; one that fails comes back as an `error` and changes nothing.
- The twin listens only to its own parent window, and after `connect`, only to that origin; a `connect` from any other origin is ignored. It posts its state and alerts only to that origin, never to `*`; `ready` is the one message posted to any origin, and it carries nothing.
- A page with an opaque origin, such as one opened from a file, cannot connect, since the twin could not answer it without answering everyone. Serve the host page over HTTP.
- The demo accepts any host. A deployment names its hosts when it builds: `VITE_EMBED_ORIGINS=https://ops.example.org npm run build`, and every other origin is ignored. It should also send a `Content-Security-Policy: frame-ancestors` header, so no other site can frame the twin at all; GitHub Pages cannot set headers, which is why the demo does not.

## Timing

- While the replay plays or live mode runs, the clock alone is reported at most once a second. A time the host sets is reported at once, and any other change straight away.
- A host's `set` is applied whole and reported once.
- `twin-alert` fires only while the clock runs forward, playing or live, for alerts that open within the step. A jump or a scrub sends the new list as `twin-alerts`, and no `twin-alert` for what was skipped.
- `alerts` is sent again when the list, a severity or the language changes. Each alert's `text` is worded as of that moment.
- In live mode the feed owns the time, so `t` and `playing` come back as errors.

## Changes

Adding a message or a field keeps the name `cutaway/1`. A change that would break an existing host gets a new name.

## Trying it locally

`embed.js` is built by `npm run build`, not by the dev server. Run `npm run build` and `npm run preview`, then open http://localhost:5181/host/.
