/*
  The alert rules' limits, in one place for the simulation that records the
  day, the integration server's rules engine that works alerts out live, and
  the interface that words how bad one is.
*/

export const LIMIT = {
  /** °C; above the second, a warm room is critical. */
  temp: 25.5,
  tempCritical: 26.5,
  /** ppm, for this many readings in a row. */
  co2: 1000,
  co2Readings: 2,
  /** Minutes a call light waits before it is flagged, and before it is critical. */
  call: 5,
  callCritical: 10,
  /** Minutes a vacated bed waits for cleaning, and a clean bed for a patient, before either is flagged. */
  dirty: 60,
  ready: 120,
  /** A pump's battery, in %, while it is in use. */
  battery: 20,
} as const
