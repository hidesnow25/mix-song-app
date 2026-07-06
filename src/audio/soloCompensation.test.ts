import { describe, it, expect } from 'vitest'
import { applyRegionGain, applySoloBoost } from './soloCompensation'

describe('applySoloBoost', () => {
  it('returns an unmodified copy when there are no regions', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3])
    const result = applySoloBoost(samples, 1000, [], Math.SQRT2)
    expect(Array.from(result)).toEqual(Array.from(samples))
    expect(result).not.toBe(samples)
  })

  it('returns an unmodified copy when boostFactor is 1 (no-op)', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3])
    const result = applySoloBoost(samples, 1000, [{ start: 0, end: 1 }], 1)
    expect(Array.from(result)).toEqual(Array.from(samples))
  })

  it('boosts the interior of a region by boostFactor, away from fade edges', () => {
    const sampleRate = 1000
    const samples = new Float32Array(100).fill(0.1)
    const result = applySoloBoost(samples, sampleRate, [{ start: 0.02, end: 0.08 }], 2, 0.005)
    // region spans samples 20..79; fade is 5 samples, so sample 50 is deep interior
    expect(result[50]).toBeCloseTo(0.2, 5)
    // untouched outside the region
    expect(result[0]).toBeCloseTo(0.1, 5)
    expect(result[99]).toBeCloseTo(0.1, 5)
  })

  it('ramps smoothly from 1x at the region boundary up to boostFactor', () => {
    const sampleRate = 1000
    const samples = new Float32Array(100).fill(1)
    const result = applySoloBoost(samples, sampleRate, [{ start: 0.02, end: 0.08 }], 2, 0.005)
    expect(result[20]).toBeCloseTo(1, 5) // boundary: continuous with untouched audio just outside
    expect(result[21]).toBeGreaterThan(result[20])
    expect(result[24]).toBeGreaterThan(result[21])
  })

  it('does not mutate the input array', () => {
    const samples = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const copy = samples.slice()
    applySoloBoost(samples, 10, [{ start: 0, end: 0.5 }], 2)
    expect(Array.from(samples)).toEqual(Array.from(copy))
  })
})

describe('applyRegionGain', () => {
  it('returns an unmodified copy when there are no regions', () => {
    const samples = new Float32Array([0.1, 0.2, 0.3])
    const result = applyRegionGain(samples, 1000, [])
    expect(Array.from(result)).toEqual(Array.from(samples))
    expect(result).not.toBe(samples)
  })

  it('applies each region its own gain, away from fade edges', () => {
    const sampleRate = 1000
    const samples = new Float32Array(200).fill(0.1)
    const result = applyRegionGain(
      samples,
      sampleRate,
      [
        { start: 0.02, end: 0.08, gain: 2 },
        { start: 0.12, end: 0.18, gain: 0.5 },
      ],
      0.005,
    )
    expect(result[50]).toBeCloseTo(0.2, 5) // interior of the first region (gain 2)
    expect(result[150]).toBeCloseTo(0.05, 5) // interior of the second region (gain 0.5)
    expect(result[0]).toBeCloseTo(0.1, 5) // untouched outside any region
  })

  it('ramps smoothly from 1x at a region boundary to its target gain', () => {
    const sampleRate = 1000
    const samples = new Float32Array(100).fill(1)
    const result = applyRegionGain(samples, sampleRate, [{ start: 0.02, end: 0.08, gain: 2 }], 0.005)
    expect(result[20]).toBeCloseTo(1, 5) // boundary: continuous with untouched audio just outside
    expect(result[21]).toBeGreaterThan(result[20])
    expect(result[24]).toBeGreaterThan(result[21])
  })

  it('treats gain 1 as a no-op for that region', () => {
    const samples = new Float32Array(10).fill(0.5)
    const result = applyRegionGain(samples, 1000, [{ start: 0, end: 0.01, gain: 1 }])
    expect(Array.from(result)).toEqual(Array.from(samples))
  })

  it('does not mutate the input array', () => {
    const samples = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    const copy = samples.slice()
    applyRegionGain(samples, 10, [{ start: 0, end: 0.5, gain: 2 }])
    expect(Array.from(samples)).toEqual(Array.from(copy))
  })
})
