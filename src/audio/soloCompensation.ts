import type { SilenceRegion } from './types'
import { DEFAULT_FADE_SECONDS } from './fadeConstants'

/**
 * Boosts `samples` within the ranges where the *other* track is silenced
 * (i.e. this track is effectively playing solo there), ramping smoothly
 * between 1x and `boostFactor` at each edge — mirroring applySilence's fade
 * shape, just inverted (ramping up instead of down). Ranges outside
 * `otherMutedRegions` are left untouched (gain 1). Does not clip; the final
 * [-1,1] clamp happens in mixTracks once both tracks are summed. Returns a
 * new array; the input is not mutated.
 */
export function applySoloBoost(
  samples: Float32Array,
  sampleRate: number,
  otherMutedRegions: SilenceRegion[],
  boostFactor: number,
  fadeSeconds: number = DEFAULT_FADE_SECONDS,
): Float32Array {
  if (otherMutedRegions.length === 0 || boostFactor === 1) return samples.slice()

  const out = samples.slice()
  const fadeSamples = Math.max(0, Math.round(fadeSeconds * sampleRate))

  const sorted = otherMutedRegions
    .map((r) => ({
      start: Math.max(0, Math.floor(r.start * sampleRate)),
      end: Math.min(out.length, Math.ceil(r.end * sampleRate)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  for (const region of sorted) {
    const { start, end } = region
    const fade = Math.min(fadeSamples, Math.floor((end - start) / 2))

    for (let i = start; i < end; i++) {
      const distFromStart = i - start
      const distFromEnd = end - 1 - i
      const edgeDist = Math.min(distFromStart, distFromEnd)
      const t = fade > 0 ? Math.min(1, edgeDist / fade) : 1
      const gain = 1 + (boostFactor - 1) * t
      out[i] *= gain
    }
  }

  return out
}
