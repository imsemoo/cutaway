import { SEED } from '../sim/simulate'
import { STEP } from '../sim/time'
import { useWard } from '../state/store'
import { applyEvents, emptyDay } from './events'
import { openFeed, webSocketTransport } from './feed'
import { mockTransport } from './mock'

/**
  Opens the feed and folds what it sends into the day the views read, and
  hands the store a way to send what the operator does. Live mode's code,
  from the feed client to the mock server, loads with this module, only
  when someone turns live mode on.
*/
export function connect() {
  const { setFeed, replayT } = useWard.getState()
  const url = import.meta.env.VITE_FEED_URL as string | undefined
  // The mock server starts its clock where the replay stood, on the five-minute grid.
  const transport = url ? webSocketTransport(url) : mockTransport(Math.floor(replayT / STEP) * STEP)
  const feed = openFeed(transport, {
    apply: (events, reset, at) => useWard.getState().applyFeed((day) => applyEvents(reset || !day ? emptyDay(SEED) : day, events), at),
    status: setFeed,
    pending: (pending) => useWard.setState({ pending }),
  })
  useWard.setState({ send: feed.act })
  return () => {
    // Anything still in the outbox goes with the feed.
    useWard.setState({ send: null, pending: [] })
    feed.close()
  }
}
