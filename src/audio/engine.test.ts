import { describe, it, expect } from 'vitest'
import { applySilence } from './silence'
import { presetToPans, mixTracks } from './mix'
import { encodeWavPCM16 } from './wav'
import { renderMix } from './render'

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

describe('presetToPans', () => {
  it('maps left preset to both tracks panned fully left', () => {
    expect(presetToPans('left')).toEqual({ panA: 0, panB: 0 })
  })

  it('maps right preset to both tracks panned fully right', () => {
    expect(presetToPans('right')).toEqual({ panA: 1, panB: 1 })
  })

  it('maps both preset to A-left, B-right stereo separation', () => {
    expect(presetToPans('both')).toEqual({ panA: 0, panB: 1 })
  })
})

describe('mixTracks', () => {
  it('isolates track A to the left channel and B to the right when panned apart', () => {
    const a = new Float32Array([0.5, 0.5])
    const b = new Float32Array([0.25, 0.25])
    const { left, right } = mixTracks(a, 0, b, 1)
    expect(left[0]).toBeCloseTo(0.5, 5)
    expect(right[0]).toBeCloseTo(0.25, 5)
  })

  it('sums both tracks into a single channel when both panned the same way', () => {
    const a = new Float32Array([0.3])
    const b = new Float32Array([0.3])
    const { left, right } = mixTracks(a, 0, b, 0)
    expect(left[0]).toBeCloseTo(0.6, 5)
    expect(right[0]).toBeCloseTo(0, 5)
  })

  it('pads the shorter track with silence instead of truncating', () => {
    const a = new Float32Array([1, 1, 1])
    const b = new Float32Array([1])
    const { left, right } = mixTracks(a, 0, b, 1)
    expect(left.length).toBe(3)
    expect(right.length).toBe(3)
    expect(right[1]).toBe(0)
    expect(right[2]).toBe(0)
  })

  it('clips summed output to [-1, 1]', () => {
    const a = new Float32Array([1])
    const b = new Float32Array([1])
    const { left } = mixTracks(a, 0.5, b, 0.5)
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

describe('renderMix', () => {
  it('applies silence regions before mixing', () => {
    const monoA = new Float32Array(20).fill(1)
    const monoB = new Float32Array(20).fill(1)
    const result = renderMix({
      monoA,
      regionsA: [{ start: 0, end: 0.02 }],
      panA: 0,
      monoB,
      regionsB: [],
      panB: 1,
      sampleRate: 1000,
    })
    // track A silenced entirely (region covers all 20 samples at 1000Hz -> 0.02s)
    expect(result.left[10]).toBeCloseTo(0, 5)
    // track B untouched, panned fully right
    expect(result.right[10]).toBeCloseTo(1, 5)
    expect(result.sampleRate).toBe(1000)
  })
})
