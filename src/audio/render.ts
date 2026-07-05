import { applySilence } from './silence'
import { applySoloBoost } from './soloCompensation'
import { mixTracks } from './mix'
import type { SilenceRegion } from './types'

export interface RenderInput {
  monoA: Float32Array
  regionsA: SilenceRegion[]
  panA: number
  volumeA: number
  monoB: Float32Array
  regionsB: SilenceRegion[]
  panB: number
  volumeB: number
  sampleRate: number
  /**
   * When set (and not 1), boosts each track's gain in ranges where the
   * *other* track is silenced (i.e. this one is effectively solo there), to
   * compensate for the natural loudness drop when going from "both tracks
   * summed" to "one track alone". Optional and off by default so existing
   * callers/tests are unaffected.
   */
  soloBoostFactor?: number
}

export interface RenderResult {
  left: Float32Array
  right: Float32Array
  sampleRate: number
}

/**
 * Pure orchestrator: applies each track's silence regions, then mixes to
 * stereo. No browser/DOM types are involved, so this function (and everything
 * it calls) is reusable as-is in a future Node-based backend port — only
 * decode.ts's file-decoding step would need a server-side replacement.
 */
export function renderMix(input: RenderInput): RenderResult {
  let a = applySilence(input.monoA, input.sampleRate, input.regionsA)
  let b = applySilence(input.monoB, input.sampleRate, input.regionsB)

  if (input.soloBoostFactor !== undefined && input.soloBoostFactor !== 1) {
    a = applySoloBoost(a, input.sampleRate, input.regionsB, input.soloBoostFactor)
    b = applySoloBoost(b, input.sampleRate, input.regionsA, input.soloBoostFactor)
  }

  const { left, right } = mixTracks(a, input.panA, input.volumeA, b, input.panB, input.volumeB)
  return { left, right, sampleRate: input.sampleRate }
}
