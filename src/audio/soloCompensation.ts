import { DEFAULT_FADE_SECONDS } from './fadeConstants'

export interface GainRegion {
  start: number
  end: number
  gain: number
}

/**
 * Applies a per-region gain multiplier to `samples`, ramping smoothly between
 * 1x and each region's `gain` at its edges — mirroring applySilence's fade
 * shape, just inverted (ramping toward the target instead of toward 0).
 * Ranges outside any region are left untouched (gain 1). Does not clip; the
 * final [-1,1] clamp happens in mixTracks once all tracks are summed. Returns
 * a new array; the input is not mutated.
 */
export function applyRegionGain(
  samples: Float32Array,
  sampleRate: number,
  regions: GainRegion[],
  fadeSeconds: number = DEFAULT_FADE_SECONDS,
): Float32Array {
  if (regions.length === 0) return samples.slice()

  const out = samples.slice()
  const fadeSamples = Math.max(0, Math.round(fadeSeconds * sampleRate))

  const sorted = regions
    .map((r) => ({
      start: Math.max(0, Math.floor(r.start * sampleRate)),
      end: Math.min(out.length, Math.ceil(r.end * sampleRate)),
      gain: r.gain,
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  for (const region of sorted) {
    const { start, end, gain } = region
    if (gain === 1) continue
    const fade = Math.min(fadeSamples, Math.floor((end - start) / 2))

    for (let i = start; i < end; i++) {
      const distFromStart = i - start
      const distFromEnd = end - 1 - i
      const edgeDist = Math.min(distFromStart, distFromEnd)
      const t = fade > 0 ? Math.min(1, edgeDist / fade) : 1
      const appliedGain = 1 + (gain - 1) * t
      out[i] *= appliedGain
    }
  }

  return out
}

/**
 * Boosts `samples` within the ranges where the *other* track is silenced
 * (i.e. this track is effectively playing solo there). Thin wrapper around
 * applyRegionGain kept for backward compatibility with existing callers/tests.
 */
export function applySoloBoost(
  samples: Float32Array,
  sampleRate: number,
  otherMutedRegions: { start: number; end: number }[],
  boostFactor: number,
  fadeSeconds: number = DEFAULT_FADE_SECONDS,
): Float32Array {
  if (otherMutedRegions.length === 0 || boostFactor === 1) return samples.slice()
  return applyRegionGain(
    samples,
    sampleRate,
    otherMutedRegions.map((r) => ({ ...r, gain: boostFactor })),
    fadeSeconds,
  )
}
