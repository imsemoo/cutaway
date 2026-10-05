import type { Building } from '../data/building'
import { SEED } from '../sim/simulate'
import { STEP } from '../sim/time'
import { useWard } from '../state/store'
import { applyEvents, emptyDay } from './events'
import { openFeed, webSocketTransport } from './feed'
import { mockTransport } from './mock'

/** Another building's feed: where it is (the mock server when unset), its day's seed, and the building, whose rooms the feed is folded into. */
export interface Source {
  url: string | undefined
  seed: number
  building: Building
}

/**
  Opens the feed and folds what it sends into the day the views read, and
  hands the store a way to send what the operator does. Live mode's code,
  from the feed client to the mock server, loads with this module, only
  when someone turns live mode on. The hospital's feed, or a building's.
*/
export function connect(source?: Source) {
  const { setFeed, replayT } = useWard.getState()
  const url = source ? source.url : (import.meta.env.VITE_FEED_URL as string | undefined)
  const empty = () => (source ? emptyDay(source.seed, source.building.spaces.map((s) => s.id)) : emptyDay(SEED))
  // The mock server starts its clock where the replay stood, on the five-minute grid.
  const transport = url ? webSocketTransport(url) : mockTransport(Math.floor(replayT / STEP) * STEP, source?.building)
  const feed = openFeed(transport, {
    apply: (events, reset, at) => useWard.getState().applyFeed((day) => applyEvents(reset || !day ? empty() : day, events), at),
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
