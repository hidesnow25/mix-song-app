import { describe, it, expect } from 'vitest'
import { applySilence } from './silence'
import { presetToMixParams, mixTracks } from './mix'
import { encodeWavPCM16 } from './wav'
import { encodeMp3 } from './mp3'
import { renderMix } from './render'
import { defaultExportFormat, extensionFromFileName } from './format'

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

describe('presetToMixParams', () => {
  it('maps "separate" to A-left, B-right stereo separation with both active', () => {
    expect(presetToMixParams('separate')).toEqual({ panA: 0, volumeA: 1, panB: 1, volumeB: 1 })
  })

  it('maps "together" to both files centered (audible from both channels)', () => {
    expect(presetToMixParams('together')).toEqual({ panA: 0.5, volumeA: 1, panB: 0.5, volumeB: 1 })
  })
})

describe('mixTracks', () => {
  it('isolates track A to the left channel and B to the right when panned apart', () => {
    const a = new Float32Array([0.5, 0.5])
    const b = new Float32Array([0.25, 0.25])
    const { left, right } = mixTracks(a, 0, 1, b, 1, 1)
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(right[0]).toBeCloseTo(0.25, 5)
  })

  it('sums both tracks into a single channel when both panned the same way', () => {
    const a = new Float32Array([0.3])
    const b = new Float32Array([0.3])
    const { left, right } = mixTracks(a, 0, 1, b, 0, 1)
    expect(left[0]).toBeCloseTo(0.6, 5)
    expect(right[0]).toBeCloseTo(0, 5)
  })

  it('excludes a track entirely when its volume is 0, regardless of pan', () => {
    const a = new Float32Array([0.5])
    const b = new Float32Array([0.9])
    const { left, right } = mixTracks(a, 0, 1, b, 0, 0)
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(right[0]).toBeCloseTo(0, 5)
  })

  it('produces exactly zero leakage into the opposite channel for hard-panned (0/1) tracks, even after 16-bit PCM quantization', () => {
    // Regression test: a hard-left-panned track (pan=0) must not audibly bleed
    // into the right channel. cos(0)=1/sin(0)=0 exactly, so this should hold
    // bit-for-bit, not just approximately. (Any perceived bleed when listening
    // to a real export is therefore not from this mixing math — see README.)
    const a = new Float32Array(50).fill(1)
    const b = new Float32Array(50).fill(0)
    const { right } = mixTracks(a, 0, 1, b, 1, 0)
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
    const { left, right } = mixTracks(a, 0, 1, b, 1, 1)
    expect(left.length).toBe(3)
    expect(right.length).toBe(3)
    expect(right[1]).toBe(0)
    expect(right[2]).toBe(0)
  })

  it('clips summed output to [-1, 1]', () => {
    const a = new Float32Array([1])
    const b = new Float32Array([1])
    const { left } = mixTracks(a, 0.5, 1, b, 0.5, 1)
    expect(left[0]).toBeLessThanOrEqual(1)
    expect(left[0]).toBeGreaterThanOrEqual(-1)
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

  it('defaults to file A extension when supported', () => {
    expect(defaultExportFormat('song.mp3', 'other.wav')).toBe('mp3')
  })

  it('falls back to file B extension when A is unsupported', () => {
    expect(defaultExportFormat('song.flac', 'other.mp3')).toBe('mp3')
  })

  it('falls back to wav when neither extension is supported', () => {
    expect(defaultExportFormat('song.flac', 'other.aac')).toBe('wav')
    expect(defaultExportFormat(null, null)).toBe('wav')
  })
})

describe('renderMix', () => {
  it('applies silence regions before mixing', () => {
    const monoA = new Float32Array(20).fill(1)
    const monoB = new Float32Array(20).fill(1)
    const result = renderMix({
      monoA,
      regionsA: [{ start: 0, end: 0.02 }],
      panA: 0,
      volumeA: 1,
      monoB,
      regionsB: [],
      panB: 1,
      volumeB: 1,
      sampleRate: 1000,
    })
    // track A silenced entirely (region covers all 20 samples at 1000Hz -> 0.02s)
    expect(result.left[10]).toBeCloseTo(0, 5)
    // track B untouched, panned fully right
    expect(result.right[10]).toBeCloseTo(1, 5)
    expect(result.sampleRate).toBe(1000)
  })

  it('excludes track B entirely when its volume is 0', () => {
    const monoA = new Float32Array(10).fill(0.4)
    const monoB = new Float32Array(10).fill(0.9)
    const result = renderMix({
      monoA,
      regionsA: [],
      panA: 0,
      volumeA: 1,
      monoB,
      regionsB: [],
      panB: 0,
      volumeB: 0,
      sampleRate: 1000,
    })
    expect(result.left[5]).toBeCloseTo(0.4, 5)
    expect(result.right[5]).toBeCloseTo(0, 5)
  })
})
