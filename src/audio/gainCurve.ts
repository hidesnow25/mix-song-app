import type { SilenceRegion } from './types'

export interface GainBreakpoint {
  time: number
  value: number
}

/**
 * Mirrors applySilence's edge-fade shape (silent, with a short linear fade at
 * each boundary) as a piecewise-linear breakpoint list in song-time seconds,
 * suitable for scheduling on a GainNode's AudioParam via
 * setValueAtTime/linearRampToValueAtTime.
 */
export function buildGainCurve(
  regions: SilenceRegion[],
  baseGain: number,
  fadeSeconds: number,
  duration: number,
): GainBreakpoint[] {
  const sorted = regions
    .map((r) => ({ start: Math.max(0, r.start), end: Math.min(duration, r.end) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  const points: GainBreakpoint[] = [{ time: 0, value: baseGain }]
  for (const r of sorted) {
    const fade = Math.min(fadeSeconds, (r.end - r.start) / 2)
    points.push({ time: r.start, value: baseGain })
    points.push({ time: r.start + fade, value: 0 })
    points.push({ time: r.end - fade, value: 0 })
    points.push({ time: r.end, value: baseGain })
  }
  points.push({ time: duration, value: baseGain })

  return points
}

/** Piecewise-linear lookup of a gain curve at an arbitrary point in time. */
export function interpolateGain(curve: GainBreakpoint[], time: number): number {
  if (curve.length === 0) return 0
  if (time <= curve[0].time) return curve[0].value

  for (let i = 1; i < curve.length; i++) {
    if (time <= curve[i].time) {
      const prev = curve[i - 1]
      const next = curve[i]
      if (next.time === prev.time) return next.value
      const t = (time - prev.time) / (next.time - prev.time)
      return prev.value + (next.value - prev.value) * t
    }
  }

  return curve[curve.length - 1].value
}
