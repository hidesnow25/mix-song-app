export interface PeakPair {
  min: number
  max: number
}

/** Downsamples PCM samples into per-bucket min/max pairs for waveform rendering. */
export function computePeaks(samples: Float32Array, bucketCount: number): PeakPair[] {
  if (bucketCount <= 0 || samples.length === 0) return []

  const peaks: PeakPair[] = new Array(bucketCount)
  const samplesPerBucket = samples.length / bucketCount

  for (let i = 0; i < bucketCount; i++) {
    const start = Math.floor(i * samplesPerBucket)
    const end = Math.max(start + 1, Math.floor((i + 1) * samplesPerBucket))

    let min = Infinity
    let max = -Infinity
    for (let j = start; j < end && j < samples.length; j++) {
      const value = samples[j]
      if (value < min) min = value
      if (value > max) max = value
    }

    peaks[i] = min === Infinity ? { min: 0, max: 0 } : { min, max }
  }

  return peaks
}
