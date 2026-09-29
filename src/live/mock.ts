import type { Transport } from './feed'

/*
  The demo's transport: numbered connections to the mock server running in
  a worker, carrying the same text frames a WebSocket would. The worker
  starts with the first connection and outlives them all, like a server.
*/

type Pipe = { conn: number; op: 'open' | 'message' | 'close'; text?: string }

let server: Worker | undefined
let count = 0
const links = new Map<number, Parameters<Transport>[0]>()

function worker(start: number) {
  if (!server) {
    server = new Worker(new URL('./server.worker.ts', import.meta.url), { type: 'module' })
    server.onmessage = (e: MessageEvent<Pipe>) => {
      const on = links.get(e.data.conn)
      if (!on) return
      if (e.data.op === 'open') on.open()
      else if (e.data.op === 'message') on.message(e.data.text ?? '')
      else {
        links.delete(e.data.conn)
        on.close()
      }
    }
    server.postMessage({ op: 'boot', start })
  }
  return server
}

/** Connects to the mock server; the first connection starts its clock at simulated minute `start`. */
export const mockTransport =
  (start: number): Transport =>
  (on) => {
    const conn = ++count
    const w = worker(start)
    links.set(conn, on)
    w.postMessage({ op: 'open', conn })
    return {
      send: (text) => w.postMessage({ op: 'send', conn, text }),
      close: () => {
        if (links.delete(conn)) w.postMessage({ op: 'close', conn })
      },
    }
  }

/** Takes the mock server down for `ms`: connections drop, and new ones are refused until it is back. */
export function outage(ms: number) {
  server?.postMessage({ op: 'outage', ms })
}
