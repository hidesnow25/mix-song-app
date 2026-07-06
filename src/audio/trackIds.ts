export type TrackId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export const TRACK_ORDER: TrackId[] = ['A', 'B', 'C', 'D', 'E', 'F']

// Always present, cannot be removed by the user.
export const BASE_TRACK_IDS: TrackId[] = ['A', 'B']

export const MAX_TRACKS = TRACK_ORDER.length
