import { PROTOCOL, type Envelope, type HostMessage, type Settings, type TwinAlert, type TwinMessage, type TwinState } from './protocol'

/*
  <cutaway-twin>: the twin for a host page, built on its own into embed.js.

    <script src="https://imsemoo.github.io/cutaway/embed.js" defer></script>
    <cutaway-twin at="level-4" layer="temp" style="height: 40rem"></cutaway-twin>

  The attributes a link takes open the twin where they say, and move it when
  they change; set() changes several at once. Events report what the twin does:
  twin-ready, twin-change, twin-select, twin-alerts, twin-alert and twin-error.
  docs/embed.md is the reference.
*/

const SETTINGS = ['at', 'select', 'view', 'layer', 't', 'mode', 'lang'] as const
// The twin lives beside this script unless the element's src says otherwise.
const HERE = (document.currentScript as HTMLScriptElement | null)?.src ?? location.href

class CutawayTwin extends HTMLElement {
  static observedAttributes = [...SETTINGS, 'src']
  #frame: HTMLIFrameElement | null = null
  #origin = ''
  #connected = false
  #waiting: Settings = {}
  #state: TwinState | null = null
  #alerts: TwinAlert[] = []

  /** Where the twin stands, as it last reported; null until it is ready. */
  get state() {
    return this.#state
  }

  /** The alerts open at the twin's minute, as it last reported. */
  get alerts() {
    return this.#alerts
  }

  /** Changes what the twin shows; settings sent before it is ready wait for it. */
  set(settings: Settings) {
    if (this.#connected) this.#post({ type: 'set', ...settings })
    else this.#waiting = { ...this.#waiting, ...settings }
  }

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.innerHTML = '<style>:host{display:block;height:36rem}iframe{display:block;width:100%;height:100%;border:0}</style>'
    const url = new URL(this.getAttribute('src') ?? './', HERE)
    for (const name of SETTINGS) {
      const value = this.getAttribute(name)
      if (value !== null) url.searchParams.set(name, value)
    }
    this.#origin = url.origin
    this.#frame = document.createElement('iframe')
    this.#frame.title = this.getAttribute('title') ?? 'Cutaway, a 3D digital twin of a hospital: a concept with simulated data'
    this.#frame.allow = 'fullscreen'
    this.#frame.src = url.href
    window.addEventListener('message', this.#receive)
    root.append(this.#frame)
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.#receive)
    this.#frame?.remove()
    this.#frame = null
    this.#connected = false
    this.#state = null
  }

  attributeChangedCallback(name: string, before: string | null, value: string | null) {
    // Attributes present at the start are already in the frame's address.
    if (!this.#frame || before === value) return
    if (name === 'src') {
      this.disconnectedCallback()
      this.connectedCallback()
    } else if (value !== null || name === 'select') {
      this.set({ [name]: value })
    }
  }

  #post(m: HostMessage) {
    this.#frame?.contentWindow?.postMessage({ protocol: PROTOCOL, ...m } satisfies Envelope<HostMessage>, this.#origin)
  }

  #emit(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }))
  }

  #receive = (e: MessageEvent<unknown>) => {
    const m = e.data as Envelope<TwinMessage> | null
    if (e.source !== this.#frame?.contentWindow || e.origin !== this.#origin || m?.protocol !== PROTOCOL) return
    switch (m.type) {
      case 'ready':
        // Also after the twin reloads: connect again, then send what waited.
        this.#connected = false
        this.#state = null
        this.#post({ type: 'connect' })
        this.#connected = true
        if (Object.keys(this.#waiting).length > 0) this.set(this.#waiting)
        this.#waiting = {}
        break
      case 'state': {
        const before = this.#state
        this.#state = m.state
        if (!before) this.#emit('twin-ready', { state: m.state })
        this.#emit('twin-change', { state: m.state, before })
        if (before && before.select !== m.state.select) this.#emit('twin-select', { id: m.state.select })
        break
      }
      case 'alerts':
        this.#alerts = m.alerts
        this.#emit('twin-alerts', { alerts: m.alerts })
        break
      case 'alert':
        this.#emit('twin-alert', { alert: m.alert })
        break
      case 'error':
        console.warn(`<cutaway-twin> ${m.key}: ${m.message}`)
        this.#emit('twin-error', { key: m.key, message: m.message })
        break
    }
  }
}

if (!customElements.get('cutaway-twin')) customElements.define('cutaway-twin', CutawayTwin)
