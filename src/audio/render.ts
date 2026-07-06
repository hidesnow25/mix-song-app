import { applySilence } from './silence'
import { applyRegionGain, type GainRegion } from './soloCompensation'
import {
  computeSeparateChannelGains,
  mixTracks,
  togetherBaselineGain,
  togetherCompensationRatio,
  type MixTrackInput,
} from './mix'
import type { SilenceRegion } from './types'
import type { TrackId } from './trackIds'

export interface RenderResult {
  left: Float32Array
  right: Float32Array
  sampleRate: number
}

/**
 * "A:left / B:right" (up to F) mode: no time axis, each file is a fixed
 * L/R channel checkbox assignment for its whole duration.
 */
export function renderSeparateMix(input: {
  tracks: { id: TrackId; mono: Float32Array; includeLeft: boolean; includeRight: boolean }[]
  sampleRate: number
}): RenderResult {
  const gains = computeSeparateChannelGains(
    input.tracks.map(({ id, includeLeft, includeRight }) => ({ id, includeLeft, includeRight })),
  )

  const mixInputs: MixTrackInput[] = input.tracks.map(({ id, mono }) => {
    const g = gains.get(id) ?? { gainL: 0, gainR: 0 }
    return { samples: mono, gainL: g.gainL, gainR: g.gainR }
  })

  const { left, right } = mixTracks(mixInputs)
  return { left, right, sampleRate: input.sampleRate }
}

export interface Segment {
  start: number
  end: number
  includedTracks: TrackId[]
}

/**
 * Fills any part of [0, duration] not covered by `segments` (i.e. still
 * pending decision) with a segment that includes every registered track —
 * this is the "both/all kept" default for audio ahead of the part-recorder's
 * current position.
 */
export function fillSegmentGaps(segments: Segment[], duration: number, allTrackIds: TrackId[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const filled: Segment[] = []
  let cursor = 0

  for (const segment of sorted) {
    if (segment.start > cursor) {
      filled.push({ start: cursor, end: segment.start, includedTracks: allTrackIds })
    }
    filled.push(segment)
    cursor = Math.max(cursor, segment.end)
  }

  if (cursor < duration) {
    filled.push({ start: cursor, end: duration, includedTracks: allTrackIds })
  }

  return filled
}

/**
 * "A/B both from left+right" mode: per-segment inclusion decided by the
 * part-recorder. Each track is silenced where it's excluded from a segment,
 * and (when `compensated`) boosted where included in a segment with fewer
 * than all tracks, so loudness stays consistent across segments with
 * different inclusion counts.
 */
export function renderTogetherMix(input: {
  tracks: { id: TrackId; mono: Float32Array }[]
  segments: Segment[]
  sampleRate: number
  compensated: boolean
}): RenderResult {
  const { tracks, segments, sampleRate, compensated } = input
  const total = tracks.length
  const duration = tracks.reduce((max, t) => Math.max(max, t.mono.length), 0) / sampleRate
  const filled = fillSegmentGaps(
    segments,
    duration,
    tracks.map((t) => t.id),
  )
  const baseline = togetherBaselineGain(total)

  const mixInputs: MixTrackInput[] = tracks.map(({ id, mono }) => {
    const excludedRegions: SilenceRegion[] = []
    const includedRegions: GainRegion[] = []

    for (const segment of filled) {
      if (!segment.includedTracks.includes(id)) {
        excludedRegions.push({ start: segment.start, end: segment.end })
      } else if (compensated) {
        const ratio = togetherCompensationRatio(total, segment.includedTracks.length)
        includedRegions.push({ start: segment.start, end: segment.end, gain: ratio })
      }
    }

    let samples = applySilence(mono, sampleRate, excludedRegions)
    if (includedRegions.length > 0) {
      samples = applyRegionGain(samples, sampleRate, includedRegions)
    }
    return { samples, gainL: baseline, gainR: baseline }
  })

  const { left, right } = mixTracks(mixInputs)
  return { left, right, sampleRate }
}
