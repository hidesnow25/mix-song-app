// Browser-only glue: a live Web Audio playback graph for instant preview
// while interactively deciding silence regions, separate from the debounced
// renderMix -> encode -> Blob pipeline used for the final downloadable file.
// Mirrors decode.ts as the seam that isolates browser-only APIs (AudioContext,
// GainNode, StereoPannerNode) from the pure engine logic in mix.ts/gainCurve.ts.

import { getSharedAudioContext } from './decode'
import { presetToMixParams } from './mix'
import { buildGainCurve, interpolateGain, type GainBreakpoint } from './gainCurve'
import { DEFAULT_FADE_SECONDS } from './fadeConstants'
import type { MixPreset, SilenceRegion } from './types'

const FADE_SECONDS = DEFAULT_FADE_SECONDS

export interface LivePreviewEngine {
  play(fromSeconds: number): Promise<void>
  pause(): number
  getPosition(): number
  isPlaying(): boolean
  setRegionsA(regions: SilenceRegion[]): void
  setRegionsB(regions: SilenceRegion[]): void
  setPreset(preset: MixPreset): void
  dispose(): void
}

interface Chain {
  buffer: AudioBuffer
  gain: GainNode
  panner: StereoPannerNode
  source: AudioBufferSourceNode | null
  curve: GainBreakpoint[]
  regions: SilenceRegion[]
  baseGain: number
}

export function createLivePreviewEngine(params: {
  monoA: Float32Array
  monoB: Float32Array
  sampleRate: number
  preset: MixPreset
}): LivePreviewEngine {
  const ctx = getSharedAudioContext()
  const duration = Math.max(params.monoA.length, params.monoB.length) / params.sampleRate

  function makeChain(mono: Float32Array): Chain {
    const buffer = ctx.createBuffer(1, mono.length, params.sampleRate)
    // Our Float32Arrays are always plain-ArrayBuffer-backed; copyToChannel's
    // DOM typing is narrower (Float32Array<ArrayBuffer>) than the general
    // Float32Array type used throughout the rest of the engine.
    buffer.copyToChannel(mono as Float32Array<ArrayBuffer>, 0)
    return {
      buffer,
      gain: ctx.createGain(),
      panner: ctx.createStereoPanner(),
      source: null,
      curve: buildGainCurve([], 1, FADE_SECONDS, duration),
      regions: [],
      baseGain: 1,
    }
  }

  const chainA = makeChain(params.monoA)
  const chainB = makeChain(params.monoB)
  chainA.gain.connect(chainA.panner)
  chainA.panner.connect(ctx.destination)
  chainB.gain.connect(chainB.panner)
  chainB.panner.connect(ctx.destination)

  let playing = false
  let playStartCtxTime = 0
  let playStartOffset = 0
  let pausedAt = 0

  function schedule(chain: Chain, offset: number) {
    const t0 = ctx.currentTime
    chain.gain.gain.cancelScheduledValues(t0)
    chain.gain.gain.setValueAtTime(interpolateGain(chain.curve, offset), t0)
    for (const point of chain.curve) {
      if (point.time <= offset) continue
      chain.gain.gain.linearRampToValueAtTime(point.value, t0 + (point.time - offset))
    }
  }

  function startSource(chain: Chain, from: number, t0: number) {
    if (chain.source) {
      try {
        chain.source.stop()
      } catch {
        // already stopped/never started — nothing to do
      }
      chain.source.disconnect()
      chain.source = null
    }
    if (from >= chain.buffer.duration) return // shorter track: nothing left to play

    const source = ctx.createBufferSource()
    source.buffer = chain.buffer
    source.connect(chain.gain)
    source.start(t0, from)
    chain.source = source
  }

  function stopAll() {
    for (const chain of [chainA, chainB]) {
      if (chain.source) {
        try {
          chain.source.stop()
        } catch {
          // already stopped/never started — nothing to do
        }
        chain.source.disconnect()
        chain.source = null
      }
    }
  }

  function getPosition(): number {
    return playing ? Math.min(duration, playStartOffset + (ctx.currentTime - playStartCtxTime)) : pausedAt
  }

  function applyPreset(preset: MixPreset) {
    const { panA, volumeA, panB, volumeB } = presetToMixParams(preset)
    chainA.panner.pan.value = panA * 2 - 1
    chainB.panner.pan.value = panB * 2 - 1
    chainA.baseGain = volumeA
    chainB.baseGain = volumeB
    chainA.curve = buildGainCurve(chainA.regions, chainA.baseGain, FADE_SECONDS, duration)
    chainB.curve = buildGainCurve(chainB.regions, chainB.baseGain, FADE_SECONDS, duration)
    if (playing) {
      schedule(chainA, getPosition())
      schedule(chainB, getPosition())
    }
  }
  applyPreset(params.preset)

  return {
    async play(fromSeconds) {
      if (ctx.state === 'suspended') await ctx.resume()
      const t0 = ctx.currentTime
      startSource(chainA, fromSeconds, t0)
      startSource(chainB, fromSeconds, t0)
      schedule(chainA, fromSeconds)
      schedule(chainB, fromSeconds)
      playStartCtxTime = t0
      playStartOffset = fromSeconds
      playing = true
    },
    pause() {
      const position = getPosition()
      stopAll()
      playing = false
      pausedAt = position
      return position
    },
    getPosition,
    isPlaying: () => playing,
    setRegionsA(regions) {
      chainA.regions = regions
      chainA.curve = buildGainCurve(regions, chainA.baseGain, FADE_SECONDS, duration)
      if (playing) schedule(chainA, getPosition())
    },
    setRegionsB(regions) {
      chainB.regions = regions
      chainB.curve = buildGainCurve(regions, chainB.baseGain, FADE_SECONDS, duration)
      if (playing) schedule(chainB, getPosition())
    },
    setPreset: applyPreset,
    dispose() {
      stopAll()
      chainA.gain.disconnect()
      chainA.panner.disconnect()
      chainB.gain.disconnect()
      chainB.panner.disconnect()
    },
  }
}
