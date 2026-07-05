import type { MixPreset } from './types'

/**
 * Maps the 2 discrete UI presets onto a per-file (pan, volume) pair that a
 * future balance slider would drive continuously.
 * - "separate": file A isolated to the left channel, file B isolated to the
 *   right (e.g. for building harmony/solo-split mixes).
 * - "together": both files are panned to center, so both are audible from
 *   both channels.
 */
export function presetToMixParams(preset: MixPreset): {
  panA: number
  volumeA: number
  panB: number
  volumeB: number
} {
  switch (preset) {
    case 'separate':
      return { panA: 0, volumeA: 1, panB: 1, volumeB: 1 }
    case 'together':
      return { panA: 0.5, volumeA: 1, panB: 0.5, volumeB: 1 }
  }
}

/** Equal-power pan law (cos/sin) so a centered pan doesn't dip in perceived loudness. */
function equalPowerGains(pan: number): { l: number; r: number } {
  const clamped = Math.min(1, Math.max(0, pan))
  const angle = clamped * (Math.PI / 2)
  return { l: Math.cos(angle), r: Math.sin(angle) }
}

export function mixTracks(
  a: Float32Array,
  panA: number,
  volumeA: number,
  b: Float32Array,
  panB: number,
  volumeB: number,
): { left: Float32Array; right: Float32Array } {
  const length = Math.max(a.length, b.length)
  const gainsA = equalPowerGains(panA)
  const gainsB = equalPowerGains(panB)

  const left = new Float32Array(length)
  const right = new Float32Array(length)

  for (let i = 0; i < length; i++) {
    const sampleA = i < a.length ? a[i] * volumeA : 0
    const sampleB = i < b.length ? b[i] * volumeB : 0
    left[i] = Math.min(1, Math.max(-1, sampleA * gainsA.l + sampleB * gainsB.l))
    right[i] = Math.min(1, Math.max(-1, sampleA * gainsA.r + sampleB * gainsB.r))
  }

  return { left, right }
}
