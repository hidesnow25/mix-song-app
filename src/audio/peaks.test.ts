import { describe, it, expect } from 'vitest'
import { computePeaks } from './peaks'

describe('computePeaks', () => {
  it('returns an empty array for empty input or zero buckets', () => {
    expect(computePeaks(new Float32Array([]), 10)).toEqual([])
    expect(computePeaks(new Float32Array([1, 2, 3]), 0)).toEqual([])
  })

  it('produces exactly bucketCount peaks', () => {
    const samples = new Float32Array(1000)
    const peaks = computePeaks(samples, 100)
    expect(peaks.length).toBe(100)
  })

  it('captures the min and max within each bucket', () => {
    // 4 samples, 2 buckets -> bucket 0 = [0,1], bucket 1 = [2,3]
    const samples = new Float32Array([0.1, -0.5, 0.8, -0.2])
    const peaks = computePeaks(samples, 2)
    expect(peaks[0].min).toBeCloseTo(-0.5, 5)
    expect(peaks[0].max).toBeCloseTo(0.1, 5)
    expect(peaks[1].min).toBeCloseTo(-0.2, 5)
    expect(peaks[1].max).toBeCloseTo(0.8, 5)
  })

  it('handles more buckets than samples without crashing', () => {
    const samples = new Float32Array([0.5, -0.5])
    const peaks = computePeaks(samples, 10)
    expect(peaks.length).toBe(10)
    for (const peak of peaks) {
      expect(peak.min).toBeGreaterThanOrEqual(-0.5)
      expect(peak.max).toBeLessThanOrEqual(0.5)
    }
  })
})
