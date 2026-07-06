import type { TrackId } from './trackIds'

export interface ChannelAssignmentInput {
  id: TrackId
  includeLeft: boolean
  includeRight: boolean
}

/**
 * "separate" mode: each side's checked files are summed independently, each
 * normalized by 1/sqrt(count on that side) so an imbalanced split (e.g. 2
 * files left, 4 right) still ends up equally loud on both sides. A file
 * checked on neither side gets {gainL:0, gainR:0}; checked on both sides, it
 * gets each side's normalized gain (audible, centered).
 */
export function computeSeparateChannelGains(
  assignments: ChannelAssignmentInput[],
): Map<TrackId, { gainL: number; gainR: number }> {
  const leftCount = assignments.filter((a) => a.includeLeft).length
  const rightCount = assignments.filter((a) => a.includeRight).length
  const leftGain = leftCount > 0 ? 1 / Math.sqrt(leftCount) : 0
  const rightGain = rightCount > 0 ? 1 / Math.sqrt(rightCount) : 0

  const result = new Map<TrackId, { gainL: number; gainR: number }>()
  for (const a of assignments) {
    result.set(a.id, {
      gainL: a.includeLeft ? leftGain : 0,
      gainR: a.includeRight ? rightGain : 0,
    })
  }
  return result
}

/**
 * "together" mode baseline: with all registered tracks included, each should
 * contribute 1/sqrt(totalRegisteredTracks) so the mix doesn't clip/get
 * louder as more files are added. Generalizes the old fixed 2-file
 * equal-power center pan (cos(45deg) = 1/sqrt(2)).
 */
export function togetherBaselineGain(totalRegisteredTracks: number): number {
  return totalRegisteredTracks > 0 ? 1 / Math.sqrt(totalRegisteredTracks) : 1
}

/**
 * Per-segment compensation ratio for "together" mode: when only some of the
 * registered tracks are included in a segment, scale them up so the segment's
 * effective per-track gain (baseline * ratio) is 1/sqrt(includedCount) — the
 * same normalization "separate" mode uses per side. For
 * totalRegisteredTracks=2, includedCountInSegment=1 this is sqrt(2), matching
 * the previous hardcoded Math.SQRT2 solo-boost constant exactly.
 */
export function togetherCompensationRatio(totalRegisteredTracks: number, includedCountInSegment: number): number {
  if (includedCountInSegment <= 0) return 1
  return Math.sqrt(totalRegisteredTracks / includedCountInSegment)
}

export interface MixTrackInput {
  samples: Float32Array
  gainL: number
  gainR: number
}

export function mixTracks(tracks: MixTrackInput[]): { left: Float32Array; right: Float32Array } {
  const length = tracks.reduce((max, t) => Math.max(max, t.samples.length), 0)

  const left = new Float32Array(length)
  const right = new Float32Array(length)

  for (const track of tracks) {
    const { samples, gainL, gainR } = track
    const count = Math.min(length, samples.length)
    for (let i = 0; i < count; i++) {
      left[i] += samples[i] * gainL
      right[i] += samples[i] * gainR
    }
  }

  for (let i = 0; i < length; i++) {
    left[i] = Math.min(1, Math.max(-1, left[i]))
    right[i] = Math.min(1, Math.max(-1, right[i]))
  }

  return { left, right }
}
