import type { TrackId } from './trackIds'

// One fixed color per file letter, independent of load order or removal, so
// e.g. removing C never shifts D/E/F's colors.
export const TRACK_COLORS: Record<TrackId, string> = {
  A: '#3b82f6',
  B: '#f97316',
  C: '#ec4899',
  D: '#ef4444',
  E: '#22c55e',
  F: '#9ca3af',
}
