import type { AssetStatus, BedState, Severity } from '../data/types'

/*
  One palette, two strengths. UI chips use the strong value; floor slabs
  in the model use the soft one, so the white model stays the ground and
  colour reads as data, not decoration.
*/

export const BED = {
  occupied: { strong: '#55657d', soft: '#cdd5e0' },
  dirty: { strong: '#b86e00', soft: '#f3bf62' },
  cleaning: { strong: '#8a6d00', soft: '#f5e08e' },
  ready: { strong: '#157a4c', soft: '#93d8b3' },
  blocked: { strong: '#a3294b', soft: '#e7a4b8' },
} satisfies Record<BedState, { strong: string; soft: string }>

export const SEVERITY: Record<Severity, string> = {
  critical: '#c8241b',
  warning: '#b86e00',
  info: '#2946c7',
}

export const ASSET_STATUS: Record<AssetStatus, string> = {
  'in-use': '#2a3a55',
  available: '#1c8f5a',
  'needs-cleaning': '#d28a0c',
  charging: '#4f79e6',
}

export const NEUTRAL_FLOOR = '#eef1f4'
export const SUPPORT_FLOOR = '#e2e7ec'
export const ACCENT = '#2946c7'

export const callColor = (waited: number | undefined) =>
  waited === undefined ? NEUTRAL_FLOOR : waited < 2 ? '#a9bff5' : waited < 5 ? '#f3bf62' : '#ef7b6b'

export const TEMP_STOPS = ['#4f86e8', '#eef1f4', '#e5532b']
export const AIR_STOPS = ['#eef1f4', '#b7a4ec', '#5a33b8']
