import { describe, it, expect } from 'vitest'
import { buildGainCurve, buildSegmentGainCurve, interpolateGain } from './gainCurve'

describe('buildGainCurve', () => {
  it('produces a flat curve at baseGain when there are no regions', () => {
    const curve = buildGainCurve([], 1, 0.01, 10)
    expect(interpolateGain(curve, 0)).toBeCloseTo(1, 5)
    expect(interpolateGain(curve, 5)).toBeCloseTo(1, 5)
    expect(interpolateGain(curve, 10)).toBeCloseTo(1, 5)
  })

  it('drops to 0 in the interior of a region and fades at its edges', () => {
    const curve = buildGainCurve([{ start: 2, end: 4 }], 1, 0.01, 10)
    expect(interpolateGain(curve, 1)).toBeCloseTo(1, 5) // before the region
    expect(interpolateGain(curve, 2)).toBeCloseTo(1, 5) // region boundary: continuous
    expect(interpolateGain(curve, 3)).toBeCloseTo(0, 5) // deep interior
    expect(interpolateGain(curve, 4)).toBeCloseTo(1, 5) // trailing boundary: continuous
    expect(interpolateGain(curve, 5)).toBeCloseTo(1, 5) // after the region
  })

  it('respects a non-1 baseGain (e.g. a preset with volume 0)', () => {
    const curve = buildGainCurve([], 0, 0.01, 10)
    expect(interpolateGain(curve, 5)).toBeCloseTo(0, 5)
  })

  it('shrinks the fade for very short regions instead of overshooting', () => {
    const curve = buildGainCurve([{ start: 2, end: 2.01 }], 1, 1, 10)
    // fade would be clamped to half the region length (0.005s), not the full 1s requested
    expect(interpolateGain(curve, 2.005)).toBeCloseTo(0, 4)
  })

  it('clamps regions to the track duration', () => {
    const curve = buildGainCurve([{ start: 8, end: 20 }], 1, 0.01, 10)
    expect(interpolateGain(curve, 9)).toBeCloseTo(0, 5)
    expect(interpolateGain(curve, 10)).toBeCloseTo(1, 5)
  })

  it('handles multiple non-overlapping regions regardless of input order', () => {
    const curve = buildGainCurve(
      [
        { start: 6, end: 7 },
        { start: 2, end: 3 },
      ],
      1,
      0.01,
      10,
    )
    expect(interpolateGain(curve, 2.5)).toBeCloseTo(0, 5)
    expect(interpolateGain(curve, 4.5)).toBeCloseTo(1, 5)
    expect(interpolateGain(curve, 6.5)).toBeCloseTo(0, 5)
  })
})

describe('buildSegmentGainCurve', () => {
  it('holds each segment flat at its own gain, away from boundaries', () => {
    const curve = buildSegmentGainCurve(
      [
        { start: 0, end: 4, gain: 1 },
        { start: 4, end: 10, gain: 0.5 },
      ],
      0.01,
      10,
    )
    expect(interpolateGain(curve, 2)).toBeCloseTo(1, 5)
    expect(interpolateGain(curve, 7)).toBeCloseTo(0.5, 5)
  })

  it('fades between segments at a changed boundary', () => {
    const curve = buildSegmentGainCurve(
      [
        { start: 0, end: 4, gain: 0 },
        { start: 4, end: 10, gain: 1 },
      ],
      0.5,
      10,
    )
    expect(interpolateGain(curve, 3)).toBeCloseTo(0, 5)
    expect(interpolateGain(curve, 4)).toBeCloseTo(0.5, 2) // mid-fade at the boundary
    expect(interpolateGain(curve, 6)).toBeCloseTo(1, 5)
  })

  it('does not fade at a boundary where the gain does not change', () => {
    const curve = buildSegmentGainCurve(
      [
        { start: 0, end: 5, gain: 1 },
        { start: 5, end: 10, gain: 1 },
      ],
      0.5,
      10,
    )
    expect(interpolateGain(curve, 5)).toBeCloseTo(1, 5)
  })

  it('returns a flat zero curve when there are no segments', () => {
    const curve = buildSegmentGainCurve([], 0.5, 10)
    expect(interpolateGain(curve, 0)).toBe(0)
    expect(interpolateGain(curve, 10)).toBe(0)
  })

  it('shrinks the fade for short segments instead of overshooting into neighbors', () => {
    const curve = buildSegmentGainCurve(
      [
        { start: 0, end: 1, gain: 0 },
        { start: 1, end: 1.02, gain: 1 },
        { start: 1.02, end: 10, gain: 0 },
      ],
      1,
      10,
    )
    // the middle segment is only 0.02s long, so the fade must be clamped well
    // below the requested 1s on both sides
    expect(interpolateGain(curve, 1.005)).toBeGreaterThan(0)
    expect(interpolateGain(curve, 1.005)).toBeLessThan(1)
  })
})

describe('interpolateGain', () => {
  it('returns 0 for an empty curve', () => {
    expect(interpolateGain([], 5)).toBe(0)
  })

  it('clamps to the first/last breakpoint outside the curve range', () => {
    const curve = buildGainCurve([], 1, 0.01, 10)
    expect(interpolateGain(curve, -5)).toBeCloseTo(1, 5)
    expect(interpolateGain(curve, 50)).toBeCloseTo(1, 5)
  })
})
