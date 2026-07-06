// Browser-only glue: a live Web Audio playback graph for instant preview
// while interactively deciding which files stay in each part-recorder
// segment, separate from the debounced renderTogetherMix -> encode -> Blob
// pipeline used for the final downloadable file. Mirrors decode.ts as the
// seam that isolates browser-only APIs (AudioContext, GainNode) from the
// pure engine logic in mix.ts/gainCurve.ts.
//
// Only used for "together" mode's part recorder — "separate" mode has no
// time axis to scrub, so each track chain always plays centered (same gain
// to both channels), which a single GainNode already achieves via Web
// Audio's default mono-to-stereo up-mix on connecting to ctx.destination.

import { getSharedAudioContext } from './decode'
import { buildSegmentGainCurve, interpolateGain, type GainBreakpoint } from './gainCurve'
import { togetherBaselineGain, togetherCompensationRatio } from './mix'
import { DEFAULT_FADE_SECONDS } from './fadeConstants'
import type { TrackId } from './trackIds'

const FADE_SECONDS = DEFAULT_FADE_SECONDS

export interface LiveSegment {
  start: number
  end: number
  includedTracks: TrackId[]
}

export interface LivePreviewEngine {
  play(fromSeconds: number): Promise<void>
  pause(): number
  getPosition(): number
  isPlaying(): boolean
  /** `segments` must fully cover [0, duration] with no gaps — see render.ts's fillSegmentGaps. */
  setSegments(segments: LiveSegment[], compensated: boolean): void
  dispose(): void
}

interface Chain {
  id: TrackId
  buffer: AudioBuffer
  gain: GainNode
  source: AudioBufferSourceNode | null
  curve: GainBreakpoint[]
}

export function createLivePreviewEngine(params: {
  tracks: { id: TrackId; mono: Float32Array }[]
  sampleRate: number
}): LivePreviewEngine {
  const ctx = getSharedAudioContext()
  const duration = params.tracks.reduce((max, t) => Math.max(max, t.mono.length), 0) / params.sampleRate
  const flatCurve: GainBreakpoint[] = [
    { time: 0, value: 0 },
    { time: duration, value: 0 },
  ]

  const chains: Chain[] = params.tracks.map(({ id, mono }) => {
    const buffer = ctx.createBuffer(1, mono.length, params.sampleRate)
    // Our Float32Arrays are always plain-ArrayBuffer-backed; copyToChannel's
    // DOM typing is narrower (Float32Array<ArrayBuffer>) than the general
    // Float32Array type used throughout the rest of the engine.
    buffer.copyToChannel(mono as Float32Array<ArrayBuffer>, 0)
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    return { id, buffer, gain, source: null, curve: flatCurve }
  })

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
    for (const chain of chains) {
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

  return {
    async play(fromSeconds) {
      if (ctx.state === 'suspended') await ctx.resume()
      const t0 = ctx.currentTime
      for (const chain of chains) {
        startSource(chain, fromSeconds, t0)
        schedule(chain, fromSeconds)
      }
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
    setSegments(segments, compensated) {
      const total = chains.length
      const baseline = togetherBaselineGain(total)
      for (const chain of chains) {
        const gainSegments = segments.map((segment) => {
          if (!segment.includedTracks.includes(chain.id)) {
            return { start: segment.start, end: segment.end, gain: 0 }
          }
          const ratio = compensated ? togetherCompensationRatio(total, segment.includedTracks.length) : 1
          return { start: segment.start, end: segment.end, gain: baseline * ratio }
        })
        chain.curve = buildSegmentGainCurve(gainSegments, FADE_SECONDS, duration)
        if (playing) schedule(chain, getPosition())
      }
    },
    dispose() {
      stopAll()
      for (const chain of chains) chain.gain.disconnect()
    },
  }
}
