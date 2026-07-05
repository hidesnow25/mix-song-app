import type { MixPreset } from './types'

/**
 * Maps the 3 discrete UI presets onto the same continuous per-file pan
 * model (0 = left, 1 = right) that a future balance slider would drive.
 * "both" pans file A fully left and file B fully right, isolating each
 * take to its own channel (e.g. for building harmony/solo-split mixes).
 */
export function presetToPans(preset: MixPreset): { panA: number; panB: number } {
  switch (preset) {
    case 'left':
      return { panA: 0, panB: 0 }
    case 'right':
      return { panA: 1, panB: 1 }
    case 'both':
      return { panA: 0, panB: 1 }
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
  b: Float32Array,
  panB: number,
): { left: Float32Array; right: Float32Array } {
  const length = Math.max(a.length, b.length)
  const gainsA = equalPowerGains(panA)
  const gainsB = equalPowerGains(panB)

  const left = new Float32Array(length)
  const right = new Float32Array(length)

  for (let i = 0; i < length; i++) {
    const sampleA = i < a.length ? a[i] : 0
    const sampleB = i < b.length ? b[i] : 0
    left[i] = Math.min(1, Math.max(-1, sampleA * gainsA.l + sampleB * gainsB.l))
    right[i] = Math.min(1, Math.max(-1, sampleA * gainsA.r + sampleB * gainsB.r))
  }

  return { left, right }
}
