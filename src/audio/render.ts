import { applySilence } from './silence'
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
  const a = applySilence(input.monoA, input.sampleRate, input.regionsA)
  const b = applySilence(input.monoB, input.sampleRate, input.regionsB)
  const { left, right } = mixTracks(a, input.panA, input.volumeA, b, input.panB, input.volumeB)
  return { left, right, sampleRate: input.sampleRate }
}
