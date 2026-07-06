import { describe, it, expect } from 'vitest'
import { applySilence } from './silence'
import { computeSeparateChannelGains, mixTracks, togetherBaselineGain, togetherCompensationRatio } from './mix'
import { encodeWavPCM16 } from './wav'
import { encodeMp3 } from './mp3'
import { renderSeparateMix, renderTogetherMix, fillSegmentGaps, type Segment } from './render'
import { defaultExportFormat, defaultOutputFileName, extensionFromFileName, sanitizeFileName } from './format'
import type { TrackId } from './trackIds'

describe('applySilence', () => {
  it('returns an unmodified copy when there are no regions', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3, 0.4])
    const result = applySilence(samples, 4, [])
    expect(Array.from(result)).toEqual(Array.from(samples))
    expect(result).not.toBe(samples)
  })

  it('zeroes the interior of a region far from its edges', () => {
    const sampleRate = 1000
    const samples = new Float32Array(100).fill(1)
    const result = applySilence(samples, sampleRate, [{ start: 0.02, end: 0.08 }], 5)
    // region spans samples 20..79; fade is 5 samples, so sample 50 is deep interior
    expect(result[50]).toBe(0)
    // untouched outside the region
    expect(result[0]).toBe(1)
    expect(result[99]).toBe(1)
  })

  it('does not clip abruptly at region edges (fade ramps toward 0)', () => {
    const sampleRate = 1000
    const samples = new Float32Array(100).fill(1)
    const result = applySilence(samples, sampleRate, [{ start: 0.02, end: 0.08 }], 5)
    // first sample of the region should be close to full volume (continuity),
    // then strictly decrease across the fade
    expect(result[20]).toBeCloseTo(1, 5)
    expect(result[21]).toBeLessThan(result[20])
    expect(result[24]).toBeLessThan(result[21])
  })

  it('does not mutate the input array', () => {
    const samples = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const copy = samples.slice()
    applySilence(samples, 10, [{ start: 0, end: 0.5 }])
    expect(Array.from(samples)).toEqual(Array.from(copy))
  })
})

describe('mixTracks', () => {
  it('isolates a hard-left track from a hard-right track', () => {
    const a = new Float32Array([0.5, 0.5])
    const b = new Float32Array([0.25, 0.25])
    const { left, right } = mixTracks([
      { samples: a, gainL: 1, gainR: 0 },
      { samples: b, gainL: 0, gainR: 1 },
    ])
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(right[0]).toBeCloseTo(0.25, 5)
  })

  it('sums multiple tracks into a single channel when all routed the same way', () => {
    const a = new Float32Array([0.3])
    const b = new Float32Array([0.3])
    const { left, right } = mixTracks([
      { samples: a, gainL: 1, gainR: 0 },
      { samples: b, gainL: 1, gainR: 0 },
    ])
    expect(left[0]).toBeCloseTo(0.6, 5)
    expect(right[0]).toBeCloseTo(0, 5)
  })

  it('excludes a track entirely when both its gains are 0', () => {
    const a = new Float32Array([0.5])
    const b = new Float32Array([0.9])
    const { left, right } = mixTracks([
      { samples: a, gainL: 1, gainR: 0 },
      { samples: b, gainL: 0, gainR: 0 },
    ])
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(right[0]).toBeCloseTo(0, 5)
  })

  it('produces exactly zero leakage into the opposite channel for hard-panned tracks, even after 16-bit PCM quantization', () => {
    // Regression test: a hard-left track (gainR=0) must not audibly bleed
    // into the right channel. (Any perceived bleed when listening to a real
    // export is therefore not from this mixing math — see README.)
    const a = new Float32Array(50).fill(1)
    const b = new Float32Array(50).fill(0)
    const { right } = mixTracks([
      { samples: a, gainL: 1, gainR: 0 },
      { samples: b, gainL: 0, gainR: 1 },
    ])
    expect(right.every((sample) => sample === 0)).toBe(true)

    const wav = encodeWavPCM16(new Float32Array(50), right, 1000)
    const view = new DataView(wav)
    for (let i = 0; i < 50; i++) {
      expect(view.getInt16(44 + i * 4 + 2, true)).toBe(0)
    }
  })

  it('pads the shorter track with silence instead of truncating', () => {
    const a = new Float32Array([1, 1, 1])
    const b = new Float32Array([1])
    const { left, right } = mixTracks([
      { samples: a, gainL: 1, gainR: 0 },
      { samples: b, gainL: 0, gainR: 1 },
    ])
    expect(left.length).toBe(3)
    expect(right.length).toBe(3)
    expect(right[1]).toBe(0)
    expect(right[2]).toBe(0)
  })

  it('clips summed output to [-1, 1]', () => {
    const a = new Float32Array([1])
    const b = new Float32Array([1])
    const { left } = mixTracks([
      { samples: a, gainL: 0.9, gainR: 0.9 },
      { samples: b, gainL: 0.9, gainR: 0.9 },
    ])
    expect(left[0]).toBeLessThanOrEqual(1)
    expect(left[0]).toBeGreaterThanOrEqual(-1)
  })

  it('sums an arbitrary number of tracks (N > 2)', () => {
    const tracks = [0.1, 0.1, 0.1, 0.1].map((v) => ({ samples: new Float32Array([v]), gainL: 1, gainR: 0 }))
    const { left } = mixTracks(tracks)
    expect(left[0]).toBeCloseTo(0.4, 5)
  })
})

describe('computeSeparateChannelGains', () => {
  it('gives each side full gain (1) when exactly one file is checked per side', () => {
    const gains = computeSeparateChannelGains([
      { id: 'A', includeLeft: true, includeRight: false },
      { id: 'B', includeLeft: false, includeRight: true },
    ])
    expect(gains.get('A')).toEqual({ gainL: 1, gainR: 0 })
    expect(gains.get('B')).toEqual({ gainL: 0, gainR: 1 })
  })

  it('normalizes each side by 1/sqrt(count on that side) when imbalanced', () => {
    const gains = computeSeparateChannelGains([
      { id: 'A', includeLeft: true, includeRight: false },
      { id: 'B', includeLeft: true, includeRight: false },
      { id: 'C', includeLeft: false, includeRight: true },
      { id: 'D', includeLeft: false, includeRight: true },
      { id: 'E', includeLeft: false, includeRight: true },
      { id: 'F', includeLeft: false, includeRight: true },
    ])
    expect(gains.get('A')!.gainL).toBeCloseTo(1 / Math.sqrt(2), 5)
    expect(gains.get('C')!.gainR).toBeCloseTo(1 / Math.sqrt(4), 5)
  })

  it('allows a file checked on both sides to be centered', () => {
    const gains = computeSeparateChannelGains([{ id: 'A', includeLeft: true, includeRight: true }])
    expect(gains.get('A')).toEqual({ gainL: 1, gainR: 1 })
  })

  it('gives an unchecked file zero gain on both sides', () => {
    const gains = computeSeparateChannelGains([{ id: 'A', includeLeft: false, includeRight: false }])
    expect(gains.get('A')).toEqual({ gainL: 0, gainR: 0 })
  })
})

describe('togetherBaselineGain / togetherCompensationRatio', () => {
  it('reduces to the previous fixed 2-file equal-power center gain (1/sqrt(2))', () => {
    expect(togetherBaselineGain(2)).toBeCloseTo(1 / Math.sqrt(2), 5)
  })

  it('matches the previous hardcoded Math.SQRT2 solo-boost constant for 2 total, 1 included', () => {
    expect(togetherCompensationRatio(2, 1)).toBeCloseTo(Math.SQRT2, 5)
  })

  it('is 1 (no-op) when every registered track is included', () => {
    expect(togetherCompensationRatio(4, 4)).toBeCloseTo(1, 5)
  })

  it('is 1 for a fully-included segment regardless of total, so baseline*ratio = 1/sqrt(included)', () => {
    for (const total of [1, 2, 3, 6]) {
      for (let included = 1; included <= total; included++) {
        const effective = togetherBaselineGain(total) * togetherCompensationRatio(total, included)
        expect(effective).toBeCloseTo(1 / Math.sqrt(included), 5)
      }
    }
  })
})

describe('encodeWavPCM16', () => {
  it('produces a valid RIFF/WAVE header with the correct data size', () => {
    const left = new Float32Array([0, 0.5, -0.5])
    const right = new Float32Array([0, 0.5, -0.5])
    const buffer = encodeWavPCM16(left, right, 44100)
    const view = new DataView(buffer)

    const readStr = (offset: number, len: number) =>
      Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('')

    expect(readStr(0, 4)).toBe('RIFF')
    expect(readStr(8, 4)).toBe('WAVE')
    expect(readStr(12, 4)).toBe('fmt ')
    expect(view.getUint16(22, true)).toBe(2) // stereo
    expect(view.getUint32(24, true)).toBe(44100)
    expect(readStr(36, 4)).toBe('data')

    const dataSize = view.getUint32(40, true)
    expect(dataSize).toBe(3 * 2 * 2) // 3 frames * 2 channels * 2 bytes
    expect(buffer.byteLength).toBe(44 + dataSize)
  })
})

describe('encodeMp3', () => {
  it('produces a non-empty MP3 buffer starting with a valid frame sync', async () => {
    const sampleRate = 44100
    const numFrames = sampleRate // 1 second
    const left = new Float32Array(numFrames)
    const right = new Float32Array(numFrames)
    for (let i = 0; i < numFrames; i++) {
      left[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate)
      right[i] = left[i]
    }

    const buffer = await encodeMp3(left, right, sampleRate)
    expect(buffer.byteLength).toBeGreaterThan(0)

    // MP3 frames start with an 11-bit frame sync: 0xFF followed by top 3 bits set
    const bytes = new Uint8Array(buffer)
    expect(bytes[0]).toBe(0xff)
    expect(bytes[1] & 0xe0).toBe(0xe0)
  })
})

describe('format helpers', () => {
  it('extracts a lowercased extension from a file name', () => {
    expect(extensionFromFileName('song.MP3')).toBe('mp3')
    expect(extensionFromFileName('take-1.wav')).toBe('wav')
    expect(extensionFromFileName('no-extension')).toBe('')
  })

  it('defaults to the first registered file extension when supported', () => {
    expect(defaultExportFormat(['song.mp3', 'other.wav'])).toBe('mp3')
  })

  it('falls back to a later file extension when earlier ones are unsupported', () => {
    expect(defaultExportFormat(['song.flac', 'other.mp3'])).toBe('mp3')
  })

  it('falls back to wav when no extension is supported', () => {
    expect(defaultExportFormat(['song.flac', 'other.aac'])).toBe('wav')
    expect(defaultExportFormat([null, null])).toBe('wav')
    expect(defaultExportFormat([])).toBe('wav')
  })
})

describe('defaultOutputFileName', () => {
  it('joins all base names (extensions stripped) with a hyphen', () => {
    expect(defaultOutputFileName(['voice-a.wav', 'voice-b.wav'])).toBe('voice-a-voice-b')
    expect(defaultOutputFileName(['a.wav', 'b.wav', 'c.wav', 'd.wav'])).toBe('a-b-c-d')
  })

  it('skips unregistered (null) slots', () => {
    expect(defaultOutputFileName(['voice-a.wav', null])).toBe('voice-a')
    expect(defaultOutputFileName([null, 'voice-b.wav'])).toBe('voice-b')
  })

  it('falls back to a generic name when no file is available', () => {
    expect(defaultOutputFileName([null, null])).toBe('mixed-song')
    expect(defaultOutputFileName([])).toBe('mixed-song')
  })
})

describe('sanitizeFileName', () => {
  it('leaves an already-valid file name untouched', () => {
    expect(sanitizeFileName('voice-a-voice-b')).toBe('voice-a-voice-b')
  })

  it('replaces characters invalid in file systems with underscores', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j')
  })

  it('trims trailing dots and spaces', () => {
    expect(sanitizeFileName('name.. ')).toBe('name')
  })

  it('falls back to a generic name when the result would be empty', () => {
    expect(sanitizeFileName('')).toBe('mixed-song')
    expect(sanitizeFileName('...')).toBe('mixed-song')
    expect(sanitizeFileName('   ')).toBe('mixed-song')
  })
})

describe('renderSeparateMix', () => {
  it('gives a single checked file per side its full gain', () => {
    const result = renderSeparateMix({
      tracks: [
        { id: 'A', mono: new Float32Array([0.5]), includeLeft: true, includeRight: false },
        { id: 'B', mono: new Float32Array([0.25]), includeLeft: false, includeRight: true },
      ],
      sampleRate: 1000,
    })
    expect(result.left[0]).toBeCloseTo(0.5, 5)
    expect(result.right[0]).toBeCloseTo(0.25, 5)
    expect(result.sampleRate).toBe(1000)
  })

  it('applies computeSeparateChannelGains normalization when a side has multiple checked files', () => {
    const result = renderSeparateMix({
      tracks: [
        { id: 'A', mono: new Float32Array([0.2]), includeLeft: true, includeRight: false },
        { id: 'B', mono: new Float32Array([0.2]), includeLeft: true, includeRight: false },
        { id: 'C', mono: new Float32Array([0.2]), includeLeft: false, includeRight: true },
      ],
      sampleRate: 1000,
    })
    const leftGain = 1 / Math.sqrt(2)
    expect(result.left[0]).toBeCloseTo(0.2 * leftGain * 2, 5)
    expect(result.right[0]).toBeCloseTo(0.2, 5)
  })

  it('excludes a file entirely when checked on neither side', () => {
    const result = renderSeparateMix({
      tracks: [{ id: 'A', mono: new Float32Array([0.5]), includeLeft: false, includeRight: false }],
      sampleRate: 1000,
    })
    expect(result.left[0]).toBeCloseTo(0, 5)
    expect(result.right[0]).toBeCloseTo(0, 5)
  })
})

describe('renderTogetherMix', () => {
  const BASELINE_2 = 1 / Math.sqrt(2)

  function track(id: TrackId, value: number, length = 20) {
    return { id, mono: new Float32Array(length).fill(value) }
  }

  it('silences a track for segments where it is excluded', () => {
    const result = renderTogetherMix({
      tracks: [track('A', 1), track('B', 1)],
      segments: [{ start: 0, end: 0.02, includedTracks: ['B'] }], // A excluded for all 20 samples @ 1000Hz
      sampleRate: 1000,
      compensated: false,
    })
    // A silenced -> only B remains, at baseline gain (no compensation requested)
    expect(result.left[10]).toBeCloseTo(BASELINE_2, 5)
    expect(result.right[10]).toBeCloseTo(BASELINE_2, 5)
  })

  it('leaves an included track at baseline gain when compensated is false', () => {
    const result = renderTogetherMix({
      tracks: [track('A', 0.3), track('B', 0.3)],
      segments: [{ start: 0, end: 0.02, includedTracks: ['A'] }],
      sampleRate: 1000,
      compensated: false,
    })
    expect(result.left[10]).toBeCloseTo(0.3 * BASELINE_2, 5)
  })

  it('boosts a solo-included track by togetherCompensationRatio when compensated is true', () => {
    const result = renderTogetherMix({
      tracks: [track('A', 0.3), track('B', 0.3)],
      segments: [{ start: 0, end: 0.02, includedTracks: ['A'] }],
      sampleRate: 1000,
      compensated: true,
    })
    const ratio = togetherCompensationRatio(2, 1) // == Math.SQRT2
    // "together" mode plays every track centered (identical gain to both
    // channels), so left and right carry the same mono downmix.
    expect(result.left[10]).toBeCloseTo(0.3 * BASELINE_2 * ratio, 5)
    expect(result.right[10]).toBeCloseTo(0.3 * BASELINE_2 * ratio, 5)
  })

  it('treats any trailing time not covered by segments as "all tracks included"', () => {
    const result = renderTogetherMix({
      tracks: [track('A', 0.3), track('B', 0.3)],
      segments: [],
      sampleRate: 1000,
      compensated: true,
    })
    // No segments recorded yet -> whole duration defaults to all-included, ratio=1
    expect(result.left[10]).toBeCloseTo(2 * 0.3 * BASELINE_2, 5)
  })

  it('generalizes baseline gain to more than 2 registered tracks', () => {
    const result = renderTogetherMix({
      tracks: [track('A', 0.3), track('B', 0.3), track('C', 0.3), track('D', 0.3)],
      segments: [],
      sampleRate: 1000,
      compensated: false,
    })
    const baseline4 = togetherBaselineGain(4)
    expect(result.left[10]).toBeCloseTo(4 * 0.3 * baseline4, 5)
  })
})

describe('fillSegmentGaps', () => {
  it('returns a single all-tracks segment when nothing has been recorded', () => {
    expect(fillSegmentGaps([], 10, ['A', 'B'])).toEqual([{ start: 0, end: 10, includedTracks: ['A', 'B'] }])
  })

  it('fills the trailing gap after the last recorded segment with all tracks included', () => {
    const filled = fillSegmentGaps([{ start: 0, end: 4, includedTracks: ['A'] }], 10, ['A', 'B'])
    expect(filled).toEqual([
      { start: 0, end: 4, includedTracks: ['A'] },
      { start: 4, end: 10, includedTracks: ['A', 'B'] },
    ])
  })

  it('leaves a fully-covered segment list unchanged', () => {
    const segments: Segment[] = [
      { start: 0, end: 5, includedTracks: ['A'] },
      { start: 5, end: 10, includedTracks: ['B'] },
    ]
    expect(fillSegmentGaps(segments, 10, ['A', 'B'])).toEqual(segments)
  })
})
