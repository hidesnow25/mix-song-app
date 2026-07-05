import type { SilenceRegion } from './types'
import { DEFAULT_FADE_SECONDS } from './fadeConstants'

/**
 * Zeroes out the given time ranges in `samples`, with a short linear fade
 * at each region's edges to avoid audible clicks. Returns a new array;
 * the input is not mutated.
 */
export function applySilence(
  samples: Float32Array,
  sampleRate: number,
  regions: SilenceRegion[],
  fadeMs = DEFAULT_FADE_SECONDS * 1000,
): Float32Array {
  if (regions.length === 0) return samples.slice()

  const out = samples.slice()
  const fadeSamples = Math.max(0, Math.round((fadeMs / 1000) * sampleRate))

  for (const region of regions) {
    const start = Math.max(0, Math.floor(region.start * sampleRate))
    const end = Math.min(out.length, Math.ceil(region.end * sampleRate))
    if (end <= start) continue

    for (let i = start; i < end; i++) {
      const distFromStart = i - start
      const distFromEnd = end - 1 - i
      const edgeDist = Math.min(distFromStart, distFromEnd)
      // gain is 1 at the region boundary (continuous with untouched audio
      // just outside it) and ramps linearly down to 0 over `fadeSamples`,
      // so the interior of a long-enough region is fully silent.
      const gain = fadeSamples > 0 ? Math.max(0, 1 - edgeDist / fadeSamples) : 0
      out[i] *= gain
    }
  }

  return out
}
